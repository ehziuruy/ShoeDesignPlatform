import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EDITOR_SETTINGS_KEY } from '@/pages/Editor'
import { Check, LogIn, LogOut, RotateCcw, User } from 'lucide-react'

interface SettingsPageProps {
  username: string | null
  onLogout: () => void
  onLogin: () => void
}

export function SettingsPage({ username, onLogout, onLogin }: SettingsPageProps) {
  const [resetDone, setResetDone] = useState(false)

  const resetEditorSettings = () => {
    localStorage.removeItem(EDITOR_SETTINGS_KEY)
    setResetDone(true)
    window.setTimeout(() => setResetDone(false), 2500)
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-gold/12 blur-[120px]" />

      <div className="relative mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">设置</h1>
          <p className="mt-1 text-sm text-[#999999]">账号与本地偏好配置</p>
        </div>

        {/* 账号 */}
        <Card className="border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 ring-0 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <User className="size-4 text-gold" />
              账号
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{username ?? '未登录'}</p>
              <p className="mt-1 text-xs text-[#999999]">
                {username ? '已登录，项目数据与 AI 配色服务已同步' : '登录后同步云端项目与 AI 配色服务'}
              </p>
            </div>
            {username ? (
              <Button
                variant="ghost"
                onClick={onLogout}
                className="gap-1.5 text-[#E5E5E5] hover:bg-gold/10 hover:text-gold-light"
              >
                <LogOut />
                退出登录
              </Button>
            ) : (
              <Button
                onClick={onLogin}
                className="gap-1.5 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
              >
                <LogIn />
                登录 / 注册
              </Button>
            )}
          </CardContent>
        </Card>

        {/* 编辑器设置 */}
        <Card className="border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 ring-0 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <RotateCcw className="size-4 text-gold" />
              编辑器设置
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">重置材质偏好</p>
              <p className="mt-1 text-xs text-[#999999]">
                清除本地保存的材质参数、配色与贴图选择，恢复默认值
              </p>
            </div>
            <Button
              variant="outline"
              onClick={resetEditorSettings}
              className="gap-1.5 border-gold/50 bg-transparent text-gold hover:bg-gold/10 hover:text-gold-light"
            >
              {resetDone && <Check className="text-gold" />}
              {resetDone ? '已重置' : '重置'}
            </Button>
          </CardContent>
        </Card>

        {/* 关于 */}
        <Card className="border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 ring-0 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base text-white">关于</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between text-[#999999]">
              <span>产品</span>
              <span className="text-[#E5E5E5]">ShoeDesignPlatform 鞋款设计平台</span>
            </div>
            <div className="flex justify-between text-[#999999]">
              <span>版本</span>
              <span className="text-[#E5E5E5]">v2.0</span>
            </div>
            <div className="flex justify-between text-[#999999]">
              <span>技术栈</span>
              <span className="text-right text-[#E5E5E5]">
                FastAPI · React 19 · Three.js · Tailwind CSS 4 · shadcn/ui
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
