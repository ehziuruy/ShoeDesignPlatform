import type { ComponentType } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  Box,
  LayoutDashboard,
  Palette,
  Settings,
  Shapes,
  Sparkles,
  Users,
} from 'lucide-react'

export type Page = 'dashboard' | 'editor' | 'colors' | 'team' | 'settings'

interface SidebarProps {
  page: Page
  onNavigate: (page: Page) => void
  username: string | null
}

interface NavItem {
  key: Page
  label: string
  icon: ComponentType<{ className?: string }>
}

const MAIN_NAV: NavItem[] = [
  { key: 'dashboard', label: '总览', icon: LayoutDashboard },
  { key: 'editor', label: '3D 编辑器', icon: Shapes },
]

const SECONDARY_NAV: NavItem[] = [
  { key: 'colors', label: 'AI 配色', icon: Palette },
  { key: 'team', label: '团队协作', icon: Users },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar({ page, onNavigate, username }: SidebarProps) {
  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = item.icon
      const active = item.key === page
      return (
        <button
          key={item.label}
          type="button"
          onClick={() => onNavigate(item.key)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            active
              ? 'bg-gold/15 text-gold-light'
              : 'text-[#999999] hover:bg-gold/10 hover:text-[#E5E5E5]',
          )}
        >
          <Icon className={cn('size-4', active && 'text-gold')} />
          {item.label}
          {active && <span className="ml-auto size-1.5 rounded-full bg-gold" />}
        </button>
      )
    })

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-gold/15 bg-black/40 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-light to-gold-dark shadow-lg shadow-gold/25">
          <Box className="size-5 text-[#241A08]" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">ShoeDesign</p>
          <p className="text-[11px] text-[#999999]">鞋款设计平台</p>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-medium tracking-wider text-[#666666] uppercase">
          工作台
        </p>
        {renderNav(MAIN_NAV)}
        <p className="px-3 pb-2 pt-5 text-[11px] font-medium tracking-wider text-[#666666] uppercase">
          更多功能
        </p>
        {renderNav(SECONDARY_NAV)}
      </nav>

      {/* 升级卡片 */}
      <div className="px-3 pb-3">
        <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold/12 to-transparent p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            <p className="text-sm font-medium text-white">升级专业版</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#999999]">
            解锁无限项目数与云端渲染
          </p>
        </div>
      </div>

      {/* 用户信息 */}
      <div className="flex items-center gap-3 border-t border-gold/15 px-5 py-4">
        <Avatar className="size-9 ring-2 ring-gold/25">
          <AvatarFallback className="bg-gradient-to-br from-gold-light to-gold-dark text-xs font-semibold text-[#241A08]">
            {username ? username[0].toUpperCase() : '客'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium text-white">
            {username ?? '访客用户'}
          </p>
          <p className="text-[11px] text-[#999999]">{username ? '已登录' : '未登录'}</p>
        </div>
      </div>
    </aside>
  )
}
