import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '@/api/request'
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
import { cn } from '@/lib/utils'
import { FileWarning, Loader2, UploadCloud } from 'lucide-react'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 上传成功后的回调（用于刷新项目列表） */
  onUploaded: () => void
}

const ALLOWED_EXTENSIONS = ['obj', 'stl']

export function UploadDialog({ open, onOpenChange, onUploaded }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ext = file?.name.split('.').pop()?.toLowerCase() ?? ''
  const extInvalid = file !== null && !ALLOWED_EXTENSIONS.includes(ext)

  const reset = () => {
    setFile(null)
    setProjectName('')
    setError(null)
    setLoading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || extInvalid) return
    setLoading(true)
    setError(null)
    try {
      await api.uploadFile(file, projectName.trim() || undefined)
      onUploaded()
      onOpenChange(false)
      reset()
    } catch (err) {
      // 展示后端魔数校验等具体错误信息
      setError(err instanceof Error ? err.message : '上传失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">上传 3D 模型</DialogTitle>
          <DialogDescription>
            支持 .obj / .stl 格式，上传时将进行文件头魔数校验
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 文件选择区 */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 transition-colors',
              extInvalid
                ? 'border-red-400/50 bg-red-400/5'
                : 'border-gold/25 bg-gold/5 hover:border-gold/50 hover:bg-gold/10',
            )}
          >
            {extInvalid ? (
              <FileWarning className="size-8 text-red-400" />
            ) : (
              <UploadCloud
                className={cn('size-8', file ? 'text-gold' : 'text-[#666666]')}
              />
            )}
            <span className="max-w-full truncate text-sm text-[#E5E5E5]">
              {file ? file.name : '点击选择模型文件'}
            </span>
            <span className="text-xs text-[#666666]">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                : '仅支持 .obj / .stl，最大 50MB'}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".obj,.stl"
            className="hidden"
            onChange={handleFileChange}
          />

          {extInvalid && (
            <p className="text-sm text-red-400">
              不支持的文件类型，请选择 .obj 或 .stl 文件
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="upload-project-name">项目名称（可选）</Label>
            <Input
              id="upload-project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="默认使用文件名"
              maxLength={100}
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
            disabled={!file || extInvalid || loading}
            className="h-9 w-full gap-2 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
          >
            {loading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            {loading ? '上传中…' : '开始上传'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
