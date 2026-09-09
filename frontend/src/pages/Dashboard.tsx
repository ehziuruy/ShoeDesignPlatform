import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type Project } from '@/api/request'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ModelPreview } from '@/components/ModelPreview'
import { RenameDialog } from '@/components/RenameDialog'
import { UploadDialog } from '@/components/UploadDialog'
import { FileBox, HardDrive, Layers, SearchX, Trash2, Upload } from 'lucide-react'

const STORAGE_QUOTA_GB = 50

/** 未登录 / 后端不可用时展示的演示数据 */
const DEMO_PROJECTS: Project[] = [
  { id: -1, project_name: '赛博朋克 2057', file_path: 'uploads/demo-01.obj', status: 'producing', created_at: '2026-08-18T10:24:00' },
  { id: -2, project_name: '极光跑者 X1', file_path: 'uploads/demo-02.stl', status: 'producing', created_at: '2026-08-16T14:12:00' },
  { id: -3, project_name: '复古德训鞋', file_path: 'uploads/demo-03.obj', status: 'draft', created_at: '2026-08-14T09:30:00' },
  { id: -4, project_name: '碳板竞速 Pro', file_path: 'uploads/demo-04.stl', status: 'producing', created_at: '2026-08-11T16:45:00' },
  { id: -5, project_name: '云感慢跑 Mate', file_path: 'uploads/demo-05.obj', status: 'draft', created_at: '2026-08-08T11:20:00' },
  { id: -6, project_name: '都市通勤 Slim', file_path: 'uploads/demo-06.obj', status: 'producing', created_at: '2026-08-05T08:05:00' },
]

function formatFromExtension(filePath: string): string {
  return filePath.split('.').pop()?.toUpperCase() ?? 'OBJ'
}

function formatStatus(status: string): { label: string; className: string } {
  // 黑金体系：待审核用琥珀金，生产中用青蓝点缀（保持状态区分度）
  return status === 'draft'
    ? {
        label: '待审核',
        className: 'border-gold/25 bg-gold/10 text-gold',
      }
    : {
        label: '生产中',
        className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
      }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

interface DashboardProps {
  search: string
  /** 点击项目卡片：进入编辑器加载对应模型 */
  onOpenProject: (project: Project) => void
}

export function Dashboard({ search, onOpenProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  // 自定义对话框目标（非空即打开）
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  // 操作失败的浮动提示（4 秒后自动消失）
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (actionError === null) return
    const timer = window.setTimeout(() => setActionError(null), 4000)
    return () => window.clearTimeout(timer)
  }, [actionError])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const data = await api.getProjects()
      setProjects(data)
      setIsDemo(false)
    } catch {
      // 未登录（401）或后端未启动时回退到演示数据
      setProjects(DEMO_PROJECTS)
      setIsDemo(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchProjects()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.project_name.toLowerCase().includes(q))
  }, [projects, search])

  // 存储占用：优先使用后端返回的真实文件大小，演示数据退化为估算
  const totalBytes = projects.reduce((sum, p) => sum + (p.file_size ?? 0), 0)
  const usedGB =
    totalBytes > 0
      ? totalBytes / 1e9
      : Math.min(STORAGE_QUOTA_GB - 1.5, projects.length * 1.2 + 2.4)
  const usedPercent = Math.round((usedGB / STORAGE_QUOTA_GB) * 100)

  /** 删除项目（打开确认对话框，乐观更新 + 失败回滚） */
  const handleDelete = (project: Project) => {
    setDeleteTarget(project)
  }

  /** 状态流转：待审核 <-> 生产中（乐观更新 + 失败回滚） */
  const handleToggleStatus = async (project: Project) => {
    const next = project.status === 'draft' ? 'producing' : 'draft'
    const prev = projects
    setProjects((list) =>
      list.map((p) => (p.id === project.id ? { ...p, status: next } : p)),
    )
    try {
      const updated = await api.updateProject(project.id, { status: next })
      setProjects((list) => list.map((p) => (p.id === project.id ? updated : p)))
    } catch (err) {
      setProjects(prev)
      setActionError(err instanceof Error ? err.message : '状态更新失败')
    }
  }

  /** 重命名项目（双击项目名打开对话框） */
  const handleRename = (project: Project) => {
    setRenameTarget(project)
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/* 背景光晕（给毛玻璃提供层次：暖金为主，少量青蓝霓虹点缀） */}
      <div className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-gold/15 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-gold-dark/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-cyan-500/8 blur-[110px]" />

      <div className="relative space-y-6 p-6 lg:p-8">
        {/* 页头 */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">总览</h1>
          <p className="mt-1 text-sm text-[#999999]">
            {isDemo ? '当前展示演示数据，登录后自动同步云端项目' : '管理你的所有鞋款设计项目'}
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 ring-0 backdrop-blur-xl">
              <CardContent className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#999999]">总资源数</p>
                  <p className="mt-2 text-4xl font-semibold tabular-nums text-gold">
                    {loading ? '-' : projects.length}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[#999999]">
                    <span className="font-medium text-gold">+2</span> 较上月
                  </p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-xl border border-gold/25 bg-gold/10">
                  <Layers className="size-5 text-gold" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            <Card className="border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 ring-0 backdrop-blur-xl">
              <CardContent className="flex items-start justify-between">
                <div className="w-full">
                  <div className="flex items-start justify-between">
                    <p className="text-sm text-[#999999]">存储占用</p>
                    <div className="flex size-11 items-center justify-center rounded-xl border border-gold/25 bg-gold/10">
                      <HardDrive className="size-5 text-gold" />
                    </div>
                  </div>
                  <p className="mt-2 text-4xl font-semibold tabular-nums text-white">
                    {loading ? '-' : usedGB < 0.01 ? usedGB.toFixed(4) : usedGB.toFixed(1)}
                    <span className="ml-1.5 text-base font-normal text-[#999999]">GB</span>
                  </p>
                  <div className="mt-3 space-y-1.5">
                    <Progress
                      value={usedPercent}
                      className="h-2 bg-gold/10 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-gold-light [&_[data-slot=progress-indicator]]:to-gold-dark"
                    />
                    <p className="text-xs text-[#999999]">
                      已用 {(usedGB * 1024).toFixed(usedGB < 0.01 ? 1 : 0)} MB / {STORAGE_QUOTA_GB} GB（{usedPercent}%）
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* 项目列表 */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-white">项目列表</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#999999]">
                {loading ? '加载中…' : `${filtered.length} 个项目`}
              </span>
              <Button
                size="sm"
                onClick={() => setUploadOpen(true)}
                className="gap-1.5 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
              >
                <Upload />
                上传模型
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-xl border border-gold/20 bg-[#121212]"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gold/20 bg-[#121212] py-16 shadow-lg shadow-black/40 backdrop-blur-xl">
              <SearchX className="size-10 text-[#666666]" />
              <p className="mt-3 text-sm text-[#E5E5E5]">没有找到匹配的项目</p>
              <p className="mt-1 text-xs text-[#666666]">换个关键词试试，或点击「上传模型」创建新项目</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={i}
                  isDemo={isDemo}
                  onOpen={onOpenProject}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => void fetchProjects()}
      />

      {/* 操作失败浮动提示 */}
      {actionError && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-400 backdrop-blur-xl">
          {actionError}
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
        title="删除项目"
        description={`确定删除「${deleteTarget?.project_name ?? ''}」？模型文件将一并删除，操作不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return
          const target = deleteTarget
          const prev = projects
          setProjects((list) => list.filter((p) => p.id !== target.id))
          try {
            await api.deleteProject(target.id)
          } catch (err) {
            setProjects(prev)
            setActionError(err instanceof Error ? err.message : '删除失败')
          }
        }}
      />

      {/* 重命名 */}
      <RenameDialog
        open={renameTarget !== null}
        initialName={renameTarget?.project_name ?? ''}
        onOpenChange={(next) => {
          if (!next) setRenameTarget(null)
        }}
        onConfirm={async (name) => {
          if (!renameTarget) return
          const target = renameTarget
          try {
            const updated = await api.updateProject(target.id, { project_name: name })
            setProjects((list) => list.map((p) => (p.id === target.id ? updated : p)))
          } catch (err) {
            setActionError(err instanceof Error ? err.message : '重命名失败')
          }
        }}
      />
    </div>
  )
}

interface ProjectCardProps {
  project: Project
  index: number
  isDemo: boolean
  onOpen: (project: Project) => void
  onDelete: (project: Project) => void
  onToggleStatus: (project: Project) => void
  onRename: (project: Project) => void
}

function ProjectCard({ project, index, isDemo, onOpen, onDelete, onToggleStatus, onRename }: ProjectCardProps) {
  const format = formatFromExtension(project.file_path)
  const status = formatStatus(project.status)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -4 }}
    >
      <Card
        onClick={() => !isDemo && onOpen(project)}
        className={isDemo ? 'border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 pt-0 ring-0 backdrop-blur-xl' : 'group cursor-pointer border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 pt-0 ring-0 backdrop-blur-xl transition-colors hover:border-gold/45'}
      >
        {/* 动态 3D 预览区：实时渲染项目模型并自转 */}
        <div className="relative mx-4 mt-4 h-32 overflow-hidden rounded-xl border border-gold/10 bg-gradient-to-br from-[#1A1A1A] via-[#141414] to-black/50">
          <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,rgba(217,164,65,0.22),transparent_60%),radial-gradient(circle_at_75%_80%,rgba(34,211,238,0.10),transparent_55%)]" />
          {!isDemo && <ModelPreview project={project} />}
          {isDemo && (
            <FileBox className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-[#666666] transition-all duration-300 group-hover:scale-110 group-hover:text-gold/70" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <Badge
            variant="outline"
            className="absolute top-3 left-3 border-gold/25 bg-black/50 text-gold backdrop-blur-sm"
          >
            {format}
          </Badge>
          {/* 删除按钮（悬停显示，演示数据隐藏） */}
          {!isDemo && (
            <button
              type="button"
              title="删除项目"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(project)
              }}
              className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-lg border border-gold/20 bg-black/50 text-[#999999] opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:border-red-400/40 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>

        <CardContent className="mt-4">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="truncate text-sm font-medium text-white"
              title={isDemo ? project.project_name : `${project.project_name}（双击重命名）`}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (!isDemo) onRename(project)
              }}
            >
              {project.project_name}
            </h3>
            <Badge
              variant="outline"
              title={isDemo ? undefined : '点击切换状态'}
              onClick={(e) => {
                e.stopPropagation()
                if (!isDemo) onToggleStatus(project)
              }}
              className={`${status.className} ${isDemo ? '' : 'cursor-pointer'}`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {status.label}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-[#999999]">
            创建于 {formatDate(project.created_at)}
            {!isDemo && project.file_size != null && (
              <span className="ml-2 text-[#666666]">
                {(project.file_size / 1024).toFixed(project.file_size < 1024 * 10 ? 1 : 0)} KB
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
