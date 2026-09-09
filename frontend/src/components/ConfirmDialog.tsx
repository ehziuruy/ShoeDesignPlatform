import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮显示为红色并带警告图标 */
  destructive?: boolean
  onConfirm: () => Promise<void> | void
}

/** 通用确认对话框（替代原生 window.confirm） */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {destructive && <AlertTriangle className="size-4 shrink-0 text-red-400" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="text-[#E5E5E5] hover:bg-gold/10 hover:text-gold-light"
          >
            {cancelText}
          </Button>
          <Button
            disabled={loading}
            onClick={() => void handleConfirm()}
            className={cn(
              destructive
                ? 'gap-1.5 bg-red-500/90 text-white hover:bg-red-500'
                : 'gap-1.5 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90',
            )}
          >
            {loading && <Loader2 className="animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
