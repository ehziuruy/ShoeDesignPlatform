import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface RenameDialogProps {
  open: boolean
  initialName: string
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => Promise<void> | void
}

/** 重命名对话框（替代原生 window.prompt） */
export function RenameDialog({ open, initialName, onOpenChange, onConfirm }: RenameDialogProps) {
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)

  // 每次打开时同步初始名称
  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const trimmed = name.trim()
  const valid = trimmed.length >= 1 && trimmed.length <= 100

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setLoading(true)
    try {
      await onConfirm(trimmed)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">重命名项目</DialogTitle>
          <DialogDescription>输入新的项目名称（1-100 个字符）</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-input">项目名称</Label>
            <Input
              id="rename-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              className="border-gold/25 bg-gold/5 text-white"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="text-[#E5E5E5] hover:bg-gold/10 hover:text-gold-light"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!valid || loading}
              className="gap-1.5 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
            >
              {loading && <Loader2 className="animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
