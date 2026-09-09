import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type ColorScheme } from '@/api/request'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Copy, RefreshCw } from 'lucide-react'

/** 后端不可用（未登录 / 未启动）时的本地灵感池 */
const LOCAL_POOL: ColorScheme[] = [
  { name: '赛博银', hex: '#B8C4D0' },
  { name: '熔岩橙', hex: '#FF5A1F' },
  { name: '极夜黑', hex: '#14141F' },
  { name: '荧光绿', hex: '#39FF88' },
  { name: '冰川蓝', hex: '#7EC8E3' },
  { name: '樱花粉', hex: '#FFB7C5' },
]

export function ColorsPage() {
  const [colors, setColors] = useState<ColorScheme[]>([])
  const [loading, setLoading] = useState(true)
  const [isLocal, setIsLocal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    try {
      setColors(await api.generateColors())
      setIsLocal(false)
    } catch {
      // 未登录或后端不可用：从本地灵感池随机抽取 5 组
      const pool = [...LOCAL_POOL]
      const picked: ColorScheme[] = []
      while (picked.length < 5 && pool.length > 0) {
        picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
      }
      setColors(picked)
      setIsLocal(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void generate()
  }, [])

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(hex)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      /* 剪贴板权限被拒时静默失败 */
    }
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/* 背景光晕（暖金为主，少量青蓝霓虹点缀） */}
      <div className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-gold/15 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-cyan-500/8 blur-[120px]" />

      <div className="relative space-y-6 p-6 lg:p-8">
        {/* 页头 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">AI 配色</h1>
            <p className="mt-1 text-sm text-[#999999]">
              基于色彩理论生成：单色系 / 邻近色 / 互补色 / 三角配色
              {isLocal && <span className="text-gold">（当前为离线灵感池）</span>}
            </p>
          </div>
          <Button
            onClick={() => void generate()}
            disabled={loading}
            className="gap-2 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {loading ? '生成中…' : '重新生成'}
          </Button>
        </div>

        {/* 配色卡片 */}
        {loading && colors.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl border border-gold/20 bg-[#121212]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {colors.map((c, i) => (
              <motion.div
                key={c.hex + c.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.25) }}
              >
                <Card
                  onClick={() => void copyHex(c.hex)}
                  className="group cursor-pointer border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 pt-0 ring-0 backdrop-blur-xl transition-colors hover:border-gold/45"
                >
                  <div
                    className="m-4 mb-0 h-40 rounded-xl border border-gold/15 shadow-lg shadow-black/30 transition-transform duration-300 group-hover:scale-[1.02]"
                    style={{ backgroundColor: c.hex }}
                  />
                  <CardContent className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{c.name}</p>
                      <p className="mt-0.5 font-mono text-xs tracking-wide text-[#999999] uppercase">
                        {c.hex}
                      </p>
                    </div>
                    {copied === c.hex ? (
                      <Check className="size-4 text-gold" />
                    ) : (
                      <Copy className="size-4 text-[#666666] transition-colors group-hover:text-[#999999]" />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <p className="text-xs text-[#666666]">点击卡片即可复制 HEX 色值</p>
      </div>
    </div>
  )
}
