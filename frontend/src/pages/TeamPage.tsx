import { motion } from 'framer-motion'
import { History, MessageSquare, Users } from 'lucide-react'

const FEATURES = [
  { icon: Users, title: '实时协同编辑', desc: '多人同时在同一鞋模上编辑材质与配色' },
  { icon: MessageSquare, title: '评论与批注', desc: '在 3D 视口中的任意位置添加批注' },
  { icon: History, title: '版本历史', desc: '完整的设计版本回溯与一键恢复' },
]

export function TeamPage() {
  return (
    <div className="relative h-full overflow-y-auto">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute -top-32 left-1/3 h-80 w-80 rounded-full bg-gold/12 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-1/4 right-0 h-64 w-64 rounded-full bg-cyan-500/8 blur-[110px]" />

      <div className="relative flex h-full flex-col items-center justify-center gap-5 p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex size-16 items-center justify-center rounded-2xl border border-gold/25 bg-[#121212] shadow-lg shadow-black/40 backdrop-blur-xl"
        >
          <Users className="size-8 text-gold" />
        </motion.div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">团队协作</h1>
          <p className="mt-2 text-sm text-[#999999]">多人实时协同设计功能开发中，敬请期待</p>
        </div>

        <div className="mt-4 grid w-full max-w-2xl gap-4 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-xl border border-gold/20 bg-[#121212] p-5 text-center shadow-lg shadow-black/40 backdrop-blur-xl"
            >
              <f.icon className="mx-auto size-6 text-gold" />
              <p className="mt-3 text-sm font-medium text-white">{f.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#999999]">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
