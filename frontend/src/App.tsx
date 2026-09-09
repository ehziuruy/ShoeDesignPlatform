import { useEffect, useRef, useState } from 'react'
import { AuthDialog } from '@/components/AuthDialog'
import { Sidebar, type Page } from '@/components/Sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, auth, UNAUTHORIZED_EVENT, type Project } from '@/api/request'
import { Dashboard } from '@/pages/Dashboard'
import { Editor } from '@/pages/Editor'
import { ColorsPage } from '@/pages/ColorsPage'
import { TeamPage } from '@/pages/TeamPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LogIn, LogOut, Search } from 'lucide-react'

type Route = { page: Page; projectId: number | null }

/** 解析地址栏 hash：#/dashboard | #/editor[/{projectId}] | #/colors | #/team | #/settings */
function parseHash(): Route {
  const hash = window.location.hash
  if (hash.startsWith('#/editor')) {
    const id = Number.parseInt(hash.slice('#/editor/'.length), 10)
    return { page: 'editor', projectId: Number.isFinite(id) && id > 0 ? id : null }
  }
  if (hash.startsWith('#/colors')) return { page: 'colors', projectId: null }
  if (hash.startsWith('#/team')) return { page: 'team', projectId: null }
  if (hash.startsWith('#/settings')) return { page: 'settings', projectId: null }
  return { page: 'dashboard', projectId: null }
}

export default function App() {
  const [page, setPage] = useState<Page>(() => parseHash().page)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [search, setSearch] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [username, setUsername] = useState<string | null>(auth.getUsername())

  // 当前选中项目的 ref：hashchange 回调中避免闭包过期，也用于跳过重复拉取
  const selectedRef = useRef<Project | null>(null)
  const setSelected = (p: Project | null) => {
    selectedRef.current = p
    setSelectedProject(p)
  }

  // hash -> state：初始加载 + 浏览器前进 / 后退（hashchange）
  useEffect(() => {
    const applyHash = () => {
      const route = parseHash()
      setPage(route.page)
      if (route.page === 'editor' && route.projectId !== null) {
        if (selectedRef.current?.id !== route.projectId) {
          setSelected(null)
          api
            .getProject(route.projectId)
            .then((p) => setSelected(p))
            .catch(() => {
              /* 未登录或项目已删除：回退内置鞋模 */
            })
        }
      } else if (selectedRef.current !== null) {
        setSelected(null)
      }
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // 错误拦截器广播的会话失效事件：重置登录态 UI
  useEffect(() => {
    const onUnauthorized = () => setUsername(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  /** 站内导航：更新状态并同步地址栏 hash（产生历史记录，支持前进/后退） */
  const navigate = (nextPage: Page, project: Project | null = null) => {
    setSelected(nextPage === 'editor' ? project : null)
    const hash =
      nextPage === 'editor' ? `#/editor${project ? `/${project.id}` : ''}` : `#/${nextPage}`
    if (window.location.hash === hash) {
      setPage(nextPage) // 同 hash 重复点击时手动应用
    } else {
      window.location.hash = hash // 触发 hashchange -> applyHash
    }
  }

  const handleLogout = () => {
    auth.clear()
    setUsername(null)
    if (page === 'editor') {
      navigate('editor') // 退出登录后清除用户项目，回退内置鞋模
    }
  }

  return (
    <div className="dark gold-texture flex h-screen overflow-hidden text-white">
      {/* 左侧固定侧边栏 */}
      <Sidebar page={page} onNavigate={(p) => navigate(p)} username={username} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部导航栏 */}
        <header className="z-10 flex h-16 shrink-0 items-center gap-4 border-b border-gold/15 bg-black/50 px-6 backdrop-blur-xl">
          <div className="relative w-full max-w-md">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#999999]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目…"
              className="border-gold/25 bg-gold/5 pl-9 text-white placeholder:text-[#666666]"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {username ? (
              <button
                type="button"
                onClick={handleLogout}
                title="点击退出登录"
                className="flex items-center gap-2.5 rounded-xl border border-gold/20 bg-gold/5 px-3 py-1.5 transition-colors hover:border-gold/40 hover:bg-gold/10"
              >
                <Avatar className="size-7 ring-1 ring-gold/30">
                  <AvatarFallback className="bg-gradient-to-br from-gold-light to-gold-dark text-xs font-semibold text-[#241A08]">
                    {username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm text-[#E5E5E5] md:inline">{username}</span>
                <LogOut className="size-4 text-[#999999]" />
              </button>
            ) : (
              <Button
                onClick={() => setAuthOpen(true)}
                className="gap-2 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
              >
                <LogIn />
                登录 / 注册
              </Button>
            )}
          </div>
        </header>

        {/* 主内容区 */}
        <main className="min-h-0 flex-1">
          {page === 'dashboard' ? (
            /* key 变化时重新挂载，登录后自动刷新项目数据 */
            <Dashboard
              key={username ?? 'guest'}
              search={search}
              onOpenProject={(p) => navigate('editor', p)}
            />
          ) : page === 'editor' ? (
            <Editor project={selectedProject} />
          ) : page === 'colors' ? (
            <ColorsPage />
          ) : page === 'team' ? (
            <TeamPage />
          ) : (
            <SettingsPage
              username={username}
              onLogout={handleLogout}
              onLogin={() => setAuthOpen(true)}
            />
          )}
        </main>
      </div>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthed={(name) => setUsername(name)}
      />
    </div>
  )
}
