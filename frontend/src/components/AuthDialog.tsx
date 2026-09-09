import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, auth } from '@/api/request'
import { Loader2, LogIn, UserPlus } from 'lucide-react'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 登录/注册成功后回调，携带用户名 */
  onAuthed: (username: string) => void
}

export function AuthDialog({ open, onOpenChange, onAuthed }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        await api.register(username, password)
      }
      const token = await api.login(username, password)
      auth.save(token.access_token, username)
      onAuthed(username)
      onOpenChange(false)
      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? '登录后同步云端项目数据与 AI 配色服务'
              : '注册新账号，开始你的鞋款设计之旅'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-username">用户名</Label>
            <Input
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-50 个字符"
              minLength={2}
              maxLength={50}
              autoComplete="username"
              required
              className="border-gold/25 bg-gold/5 text-white placeholder:text-[#666666]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-password">密码</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              minLength={6}
              maxLength={72}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              className="border-gold/25 bg-gold/5 text-white placeholder:text-[#666666]"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-9 w-full gap-2 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : mode === 'login' ? (
              <LogIn />
            ) : (
              <UserPlus />
            )}
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
          </Button>

          <button
            type="button"
            onClick={switchMode}
            className="w-full text-center text-sm text-[#999999] transition-colors hover:text-gold-light"
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？直接登录'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
