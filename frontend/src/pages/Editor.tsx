import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Grid,
  Html,
  Lightformer,
  OrbitControls,
  useGLTF,
} from '@react-three/drei'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { api, type ColorScheme, type Project } from '@/api/request'
import { loadProjectModel, type LoadedModel } from '@/lib/modelLoader'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Download, MousePointer2, Palette, RotateCcw, Sparkles } from 'lucide-react'

/** 编辑器设置持久化键：各部件材质 / 贴图密度 / 灯光预设，刷新后自动恢复（设置页用于重置） */
export const EDITOR_SETTINGS_KEY = 'sdp_editor_settings'

/** 写实鞋模（Draco 压缩 GLB，drei shoe-configurator 同款实物扫描模型），本地化无网络依赖 */
const MODEL_URL = '/models/shoe-draco.glb'
/** 本地 Draco 解码器（复制自 three 的 npm 包） */
const DRACO_PATH = '/draco/'

/** 后端不可用（未登录 / 未启动）时的本地配色灵感池 */
const FALLBACK_COLORS: ColorScheme[] = [
  { name: '赛博银', hex: '#B8C4D0' },
  { name: '熔岩橙', hex: '#FF5A1F' },
  { name: '极夜黑', hex: '#14141F' },
  { name: '荧光绿', hex: '#39FF88' },
  { name: '冰川蓝', hex: '#7EC8E3' },
  { name: '樱花粉', hex: '#FFB7C5' },
]

// ---------------- 部件定义 ----------------

/**
 * 4 个可编辑部件分组：GLTF 鞋模自带 8 个真实材质部件，按区域映射为 4 组
 * - vamp 鞋面：主体网布 / 侧面条纹 / 鞋口绷带 / 鞋舌标 / 内衬
 * - laces 鞋带：鞋带
 * - sole 鞋底：一体式鞋底（中底 + 外底）
 * - caps 包边：鞋头包 + 后跟支撑（橡胶包覆件）
 */
type PartKey = 'vamp' | 'laces' | 'sole' | 'caps'

const PART_KEYS: PartKey[] = ['vamp', 'laces', 'sole', 'caps']

const PART_LABELS: Record<PartKey, string> = {
  vamp: '鞋面',
  laces: '鞋带',
  sole: '鞋底',
  caps: '包边 / 后跟',
}

/** GLTF 材质名 -> 部件分组映射 */
const MATERIAL_PART_MAP: Record<string, PartKey> = {
  mesh: 'vamp',
  stripes: 'vamp',
  band: 'vamp',
  patch: 'vamp',
  inner: 'vamp',
  laces: 'laces',
  sole: 'sole',
  caps: 'caps',
}

/** AI 配色依次分配的部件顺序 */
const PALETTE_PARTS: PartKey[] = ['vamp', 'sole', 'caps', 'laces']

/** 选中部件的高亮自发光颜色（黑金体系：亮金高亮） */
const HIGHLIGHT_COLOR = '#F2B852'

/** 单个部件的完整材质状态 */
interface PartMaterialState {
  color: string
  roughness: number
  metalness: number
  opacity: number
  /** 法线强度（normalScale），作用于贴图推导或程序化噪声法线贴图 */
  normalScale: number
  /** 鞋面贴图清单索引，null 表示无贴图 */
  textureIndex: number | null
}

const DEFAULT_PARTS: Record<PartKey, PartMaterialState> = {
  vamp: { color: '#B8C4D0', roughness: 0.7, metalness: 0.1, opacity: 1, normalScale: 1, textureIndex: null },
  laces: { color: '#E8E8EE', roughness: 0.8, metalness: 0, opacity: 1, normalScale: 0.8, textureIndex: null },
  sole: { color: '#EDEDF2', roughness: 0.5, metalness: 0.05, opacity: 1, normalScale: 0.6, textureIndex: null },
  caps: { color: '#C79A3B', roughness: 0.45, metalness: 0.2, opacity: 1, normalScale: 0.8, textureIndex: null },
}

/** 鞋面贴图清单条目（public/textures/textures.json，由爬虫产物同步而来） */
interface TextureInfo {
  name: string
  file: string
}

/** 已加载的贴图资源：颜色贴图 + 由其推导的法线贴图 */
type TextureLibrary = Record<number, { color: THREE.Texture; normal: THREE.Texture }>

// ---------------- 灯光预设 ----------------

const LIGHT_PRESETS = {
  warm: { label: '暖色', ambientColor: '#FFD9B3', ambientIntensity: 0.55, keyColor: '#FFB37A', keyIntensity: 1.8 },
  cool: { label: '冷色', ambientColor: '#B8D4FF', ambientIntensity: 0.5, keyColor: '#9AB8FF', keyIntensity: 1.6 },
  white: { label: '亮白', ambientColor: '#FFFFFF', ambientIntensity: 0.65, keyColor: '#FFFFFF', keyIntensity: 2.1 },
} as const

type LightKey = keyof typeof LIGHT_PRESETS

// ---------------- 编辑器设置持久化 ----------------

interface EditorSettings {
  parts: Record<PartKey, PartMaterialState>
  textureRepeat: number
  lightPreset: LightKey
}

function loadEditorSettings(): Partial<EditorSettings> {
  try {
    return JSON.parse(localStorage.getItem(EDITOR_SETTINGS_KEY) ?? '{}') as Partial<EditorSettings>
  } catch {
    return {}
  }
}

// ---------------- 法线贴图生成 ----------------

/** 将高度场编码为法线贴图（Sobel 梯度 -> RGB 法线） */
function encodeNormalCanvas(
  heights: Float32Array,
  size: number,
  strength: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Canvas 2D 上下文不可用')
  }
  const out = ctx.createImageData(size, size)
  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * size + x) * 4
      out.data[i] = (dx * inv * 0.5 + 0.5) * 255
      out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255
      out.data[i + 2] = (inv * 0.5 + 0.5) * 255
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** 由贴图图像推导法线贴图（亮度作为高度场） */
function makeNormalMapFromImage(image: HTMLImageElement): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Canvas 2D 上下文不可用')
  }
  ctx.drawImage(image, 0, 0, size, size)
  const src = ctx.getImageData(0, 0, size, size)
  const heights = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const j = i * 4
    heights[i] = (src.data[j] * 0.299 + src.data[j + 1] * 0.587 + src.data[j + 2] * 0.114) / 255
  }
  return encodeNormalCanvas(heights, size, 2.2)
}

/** 程序化噪声法线贴图：未贴图部件的默认凹凸细节（法线强度滑块始终有效） */
function makeNoiseNormalMap(): THREE.CanvasTexture {
  const size = 128
  let heights = new Float32Array(size * size)
  for (let i = 0; i < heights.length; i++) {
    heights[i] = Math.random()
  }
  // 两轮盒式模糊，得到平缓的颗粒起伏而非剧烈噪点
  for (let pass = 0; pass < 2; pass++) {
    const smoothed = new Float32Array(heights.length)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += heights[((y + dy + size) % size) * size + ((x + dx + size) % size)]
          }
        }
        smoothed[y * size + x] = sum / 9
      }
    }
    heights = smoothed
  }
  return encodeNormalCanvas(heights, size, 1.4)
}

// ---------------- 材质与模型组件 ----------------

/** 模型加载中的浮动提示（drei Html 渲染在画布内） */
function ModelLoader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/20 bg-black/70 px-6 py-5 backdrop-blur-xl">
        <div className="size-6 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
        <p className="text-sm text-[#E5E5E5]">正在加载鞋模…</p>
      </div>
    </Html>
  )
}

interface PartMaterialProps {
  state: PartMaterialState
  /** 选中部件以自发光高亮 */
  selected: boolean
  textureLibrary: TextureLibrary
  noiseNormal: THREE.Texture
}

/** 独立部件材质：颜色 / 贴图 / 法线 / 滑块参数 / 高亮全部按部件独立 */
function PartMaterial({ state, selected, textureLibrary, noiseNormal }: PartMaterialProps) {
  const lib = state.textureIndex !== null ? textureLibrary[state.textureIndex] : undefined
  return (
    <meshPhysicalMaterial
      // 透明模式与贴图开关会改变着色器宏，切换时重建材质
      key={`${state.opacity < 1}-${lib !== undefined}`}
      color={state.color}
      map={lib?.color}
      normalMap={lib ? lib.normal : noiseNormal}
      normalScale={[state.normalScale, state.normalScale]}
      roughness={state.roughness}
      metalness={state.metalness}
      transparent={state.opacity < 1}
      opacity={state.opacity}
      clearcoat={0.3}
      envMapIntensity={1}
      emissive={selected ? HIGHLIGHT_COLOR : '#000000'}
      emissiveIntensity={selected ? 0.45 : 0}
    />
  )
}

interface GltfShoeProps {
  parts: Record<PartKey, PartMaterialState>
  selectedPart: PartKey
  textureLibrary: TextureLibrary
  noiseNormal: THREE.Texture
  groupRef: React.RefObject<THREE.Group | null>
}

/**
 * 写实鞋模：加载 Draco 压缩 GLTF 实物扫描模型（自带 8 个真实材质部件），
 * 按 MATERIAL_PART_MAP 映射为 4 个可编辑部件分组，各自独立材质。
 * 运行时归一化：鞋长统一 4.5、底部贴地、水平居中、Z 轴朝向自动旋转。
 */
function GltfShoeModel({ parts, selectedPart, textureLibrary, noiseNormal, groupRef }: GltfShoeProps) {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH)
  const innerRef = useRef<THREE.Group>(null)

  // 按 GLTF 材质名收集部件网格并映射到分组
  const partMeshes = useMemo(() => {
    const list: Array<{ part: PartKey; geometry: THREE.BufferGeometry }> = []
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.material) {
        const name = (mesh.material as THREE.MeshStandardMaterial).name
        const part = MATERIAL_PART_MAP[name]
        if (part) {
          list.push({ part, geometry: mesh.geometry })
        }
      }
    })
    return list
  }, [scene])

  // 归一化模型尺度与朝向
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    let box = new THREE.Box3().setFromObject(inner)
    let size = box.getSize(new THREE.Vector3())
    // 若鞋长沿 Z 轴，旋转 90° 统一到 X 轴
    if (size.z > size.x) {
      inner.rotation.y = Math.PI / 2
      box = new THREE.Box3().setFromObject(inner)
      size = box.getSize(new THREE.Vector3())
    }
    const scale = 4.5 / Math.max(size.x, 0.001)
    inner.scale.setScalar(scale)
    box = new THREE.Box3().setFromObject(inner)
    const center = box.getCenter(new THREE.Vector3())
    inner.position.set(-center.x, -box.min.y, -center.z)
  }, [partMeshes])

  return (
    <group ref={groupRef} position={[0, -0.6, 0]} rotation={[0, -0.45, 0]}>
      <group ref={innerRef}>
        {partMeshes.map(({ part, geometry }, i) => (
          <mesh
            key={`${part}-${i}`}
            geometry={geometry}
            castShadow
            receiveShadow
            userData={{ component: part }}
          >
            <PartMaterial
              state={parts[part]}
              selected={part === selectedPart}
              textureLibrary={textureLibrary}
              noiseNormal={noiseNormal}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

interface ProjectModelProps {
  project: Project
  /** 用户模型为单一材质，由「鞋面」部件的材质状态驱动 */
  materialState: PartMaterialState
  textureLibrary: TextureLibrary
  noiseNormal: THREE.Texture
  groupRef: React.RefObject<THREE.Group | null>
  onError: (message: string) => void
}

/** 用户上传模型：GLB 项目按自带多材质原样渲染，OBJ/STL 单材质（由鞋面部件状态驱动） */
function ProjectModel({ project, materialState, textureLibrary, noiseNormal, groupRef, onError }: ProjectModelProps) {
  const [model, setModel] = useState<LoadedModel | null>(null)
  const innerRef = useRef<THREE.Group>(null)

  useEffect(() => {
    let cancelled = false
    setModel(null)
    loadProjectModel(project)
      .then((loaded) => {
        if (!cancelled) setModel(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : '模型加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [project.id, project.file_path, project.file_size, onError])

  // OBJ/STL：从模型对象中提取几何体列表（GLB 不走此路径）
  const geometries = useMemo(() => {
    if (!model || model.isGltf) return null
    const geos: THREE.BufferGeometry[] = []
    model.object.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.geometry) {
        geos.push(mesh.geometry)
      }
    })
    return geos.length > 0 ? geos : null
  }, [model])

  // 归一化模型：最长水平维度统一为 4.5、底部贴地、水平居中
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !model) return
    let box = new THREE.Box3().setFromObject(inner)
    let size = box.getSize(new THREE.Vector3())
    if (size.z > size.x) {
      inner.rotation.y = Math.PI / 2
      box = new THREE.Box3().setFromObject(inner)
      size = box.getSize(new THREE.Vector3())
    }
    const scale = 4.5 / Math.max(size.x, 0.001)
    inner.scale.setScalar(scale)
    box = new THREE.Box3().setFromObject(inner)
    const center = box.getCenter(new THREE.Vector3())
    inner.position.set(-center.x, -box.min.y, -center.z)
  }, [model])

  if (!model || (!model.isGltf && !geometries)) {
    return <ModelLoader />
  }
  return (
    <group ref={groupRef} position={[0, -0.6, 0]} rotation={[0, -0.45, 0]}>
      <group ref={innerRef}>
        {model.isGltf ? (
          <primitive object={model.object} />
        ) : (
          geometries!.map((geometry, i) => (
            <mesh key={i} geometry={geometry} castShadow receiveShadow userData={{ component: 'vamp' }}>
              <PartMaterial
                state={materialState}
                selected={false}
                textureLibrary={textureLibrary}
                noiseNormal={noiseNormal}
              />
            </mesh>
          ))
        )}
      </group>
    </group>
  )
}

// ---------------- 滑块行 ----------------

/** 滑块行：中文标签 + 英文术语 + 数值实时显示 */
function SliderRow({
  label,
  en,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string
  en: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#E5E5E5]">
          {label} <span className="ml-1 text-xs text-[#999999]">{en}</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-[#999999]">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

// ---------------- 编辑器主组件 ----------------

interface EditorProps {
  /** 待编辑的用户项目（null 表示使用内置风格化鞋模） */
  project: Project | null
}

export function Editor({ project }: EditorProps) {
  // ---- 持久化设置恢复（刷新后自动恢复各部件材质与灯光预设） ----
  const saved = useRef<Partial<EditorSettings> | null>(null)
  if (saved.current === null) {
    saved.current = loadEditorSettings()
  }
  const s = saved.current

  const [parts, setParts] = useState<Record<PartKey, PartMaterialState>>(() => {
    const next = { ...DEFAULT_PARTS }
    const stored = s.parts
    if (stored) {
      for (const key of PART_KEYS) {
        const raw = stored[key]
        if (!raw) continue
        next[key] = {
          color: typeof raw.color === 'string' ? raw.color : next[key].color,
          roughness: typeof raw.roughness === 'number' ? raw.roughness : next[key].roughness,
          metalness: typeof raw.metalness === 'number' ? raw.metalness : next[key].metalness,
          opacity: typeof raw.opacity === 'number' ? raw.opacity : next[key].opacity,
          normalScale: typeof raw.normalScale === 'number' ? raw.normalScale : next[key].normalScale,
          textureIndex:
            typeof raw.textureIndex === 'number' && raw.textureIndex >= 0 ? raw.textureIndex : null,
        }
      }
    }
    return next
  })
  const [selectedPart, setSelectedPart] = useState<PartKey>('vamp')
  const [textureRepeat, setTextureRepeat] = useState(
    typeof s.textureRepeat === 'number' ? s.textureRepeat : 2,
  )
  const [lightPreset, setLightPreset] = useState<LightKey>(
    s.lightPreset && s.lightPreset in LIGHT_PRESETS ? s.lightPreset : 'white',
  )

  const [palette, setPalette] = useState<ColorScheme[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFallback, setAiFallback] = useState(false)

  // ---- 贴图资源 ----
  const [textures, setTextures] = useState<TextureInfo[]>([])
  const [textureLibrary, setTextureLibrary] = useState<TextureLibrary>({})
  const noiseNormal = useMemo(() => makeNoiseNormalMap(), [])

  // ---- 用户项目模型加载失败状态 ----
  const [projectError, setProjectError] = useState<string | null>(null)
  const handleProjectError = useCallback((message: string) => setProjectError(message), [])

  const shoeRef = useRef<THREE.Group>(null)
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const current = parts[selectedPart]

  // 设置持久化
  useEffect(() => {
    const settings: EditorSettings = { parts, textureRepeat, lightPreset }
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings))
  }, [parts, textureRepeat, lightPreset])

  // 切换项目时清除上一次的加载失败状态
  useEffect(() => {
    setProjectError(null)
  }, [project])

  // 加载贴图清单（spider 爬虫产物已同步到 public/textures/）
  useEffect(() => {
    let cancelled = false
    fetch('/textures/textures.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('manifest unavailable'))))
      .then((data: { textures?: TextureInfo[] }) => {
        const list = data.textures
        if (cancelled || !Array.isArray(list)) return
        setTextures(list)
        // 持久化的贴图索引越界时复位（重爬纹理后清单可能变短）
        setParts((prev) => {
          const next = { ...prev }
          for (const key of PART_KEYS) {
            const idx = next[key].textureIndex
            if (idx !== null && idx >= list.length) {
              next[key] = { ...next[key], textureIndex: null }
            }
          }
          return next
        })
      })
      .catch(() => {
        /* 清单不存在时隐藏贴图选择区 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 加载全部贴图并为每张推导法线贴图（Sobel），供各部件独立选用
  useEffect(() => {
    if (textures.length === 0) return
    let cancelled = false
    let pending = textures.length
    const lib: TextureLibrary = {}
    const done = () => {
      pending -= 1
      if (pending === 0 && !cancelled) setTextureLibrary({ ...lib })
    }
    const loader = new THREE.TextureLoader()
    textures.forEach((info, index) => {
      loader.load(
        `/textures/${encodeURIComponent(info.file)}`,
        (tex) => {
          if (cancelled) {
            tex.dispose()
            done()
            return
          }
          tex.colorSpace = THREE.SRGBColorSpace
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.RepeatWrapping
          tex.repeat.set(textureRepeat, textureRepeat)
          try {
            const normal = makeNormalMapFromImage(tex.image as HTMLImageElement)
            normal.repeat.set(textureRepeat, textureRepeat)
            lib[index] = { color: tex, normal }
          } catch {
            lib[index] = { color: tex, normal: noiseNormal }
          }
          done()
        },
        undefined,
        done,
      )
    })
    return () => {
      cancelled = true
    }
  }, [textures, noiseNormal])

  // 贴图密度变化时同步到所有已加载贴图
  useEffect(() => {
    for (const { color, normal } of Object.values(textureLibrary)) {
      color.repeat.set(textureRepeat, textureRepeat)
      normal.repeat.set(textureRepeat, textureRepeat)
    }
  }, [textureLibrary, textureRepeat])

  /** 更新当前选中部件的材质参数 */
  const updateSelectedPart = (patch: Partial<PartMaterialState>) => {
    setParts((prev) => ({
      ...prev,
      [selectedPart]: { ...prev[selectedPart], ...patch },
    }))
  }

  /** 选择贴图：应用到当前部件（贴图与颜色相乘，启用时该部件置白呈现纹理原色） */
  const selectTexture = (index: number | null) => {
    setParts((prev) => ({
      ...prev,
      [selectedPart]: {
        ...prev[selectedPart],
        textureIndex: index,
        ...(index !== null ? { color: '#FFFFFF' } : {}),
      },
    }))
  }

  /** 将 AI 返回的配色分配到 4 个部件 */
  const applyPalette = (colors: ColorScheme[]) => {
    setParts((prev) => {
      const next = { ...prev }
      PALETTE_PARTS.forEach((part, i) => {
        if (colors[i]) next[part] = { ...next[part], color: colors[i].hex }
      })
      return next
    })
  }

  const handleGenerate = async () => {
    setAiLoading(true)
    try {
      const colors = await api.generateColors()
      setPalette(colors)
      setAiFallback(false)
      applyPalette(colors)
    } catch {
      // 未登录或后端不可用：从本地灵感池随机抽取 5 组
      const pool = [...FALLBACK_COLORS]
      const picked: ColorScheme[] = []
      while (picked.length < 5 && pool.length > 0) {
        picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
      }
      setPalette(picked)
      setAiFallback(true)
      applyPalette(picked)
    } finally {
      setAiLoading(false)
    }
  }

  const handleExport = () => {
    if (!shoeRef.current) return
    const exporter = new STLExporter()
    const stl = exporter.parse(shoeRef.current) as string
    const blob = new Blob([stl], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project ? project.project_name : 'shoe-design'}-${Date.now()}.stl`
    link.click()
    URL.revokeObjectURL(url)
  }

  const preset = LIGHT_PRESETS[lightPreset]
  const projectExt = project?.file_path.split('.').pop()?.toUpperCase()

  return (
    <div className="relative h-full overflow-hidden">
      {/* 背景光晕（暖金为主，少量青蓝霓虹点缀） */}
      <div className="pointer-events-none absolute top-0 left-1/4 h-96 w-96 rounded-full bg-gold/12 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-cyan-500/8 blur-[120px]" />

      {/* 3D 画布 */}
      <div className="absolute inset-0">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [4.4, 2.6, 4.8], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          {/* 灯光预设：环境光 + 主光源随预设切换颜色与强度 */}
          <ambientLight color={preset.ambientColor} intensity={preset.ambientIntensity} />
          <directionalLight
            position={[5, 8, 4]}
            color={preset.keyColor}
            intensity={preset.keyIntensity}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#8ab4ff" />

          {project && !projectError ? (
            <ProjectModel
              project={project}
              materialState={parts.vamp}
              textureLibrary={textureLibrary}
              noiseNormal={noiseNormal}
              groupRef={shoeRef}
              onError={handleProjectError}
            />
          ) : (
            <Suspense fallback={<ModelLoader />}>
              <GltfShoeModel
                parts={parts}
                selectedPart={selectedPart}
                textureLibrary={textureLibrary}
                noiseNormal={noiseNormal}
                groupRef={shoeRef}
              />
            </Suspense>
          )}

          {/* 程序化环境反射：Lightformer 生成的棚拍灯光，无网络依赖 */}
          <Environment resolution={256}>
            <Lightformer
              intensity={2}
              position={[0, 5, 0]}
              rotation-x={Math.PI / 2}
              scale={[10, 10, 1]}
            />
            <Lightformer
              intensity={1.5}
              position={[-5, 1, -1]}
              rotation-y={Math.PI / 2}
              scale={[8, 2, 1]}
            />
            <Lightformer
              intensity={1.5}
              position={[5, 1, 1]}
              rotation-y={-Math.PI / 2}
              scale={[8, 2, 1]}
              color="#dbe7ff"
            />
            <Lightformer
              intensity={0.7}
              position={[0, 1, -6]}
              scale={[10, 4, 1]}
              color="#d9a441"
            />
          </Environment>

          <ContactShadows
            position={[0, -0.62, 0]}
            opacity={0.55}
            scale={12}
            blur={2.6}
            far={3.2}
            color="#000000"
          />
          <Grid
            position={[0, -0.63, 0]}
            args={[20, 20]}
            cellSize={0.6}
            cellThickness={0.6}
            cellColor="#28241A"
            sectionSize={3}
            sectionThickness={1}
            sectionColor="#42392A"
            fadeDistance={18}
            fadeStrength={1.5}
            infiniteGrid
          />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            autoRotate
            autoRotateSpeed={0.9}
            minDistance={3.5}
            maxDistance={12}
            maxPolarAngle={Math.PI / 2.1}
            target={[0, 0.15, 0]}
          />
        </Canvas>
      </div>

      {/* 左侧：部件列表 */}
      <div className="absolute top-5 left-5 z-10 w-48 rounded-2xl border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 p-4 backdrop-blur-xl">
        <p className="text-sm font-medium text-white">部件列表</p>
        <ToggleGroup
          type="single"
          variant="vertical"
          value={selectedPart}
          onValueChange={(value) => {
            if (value) setSelectedPart(value as PartKey)
          }}
          className="mt-3 w-full gap-2"
        >
          {PART_KEYS.map((key) => (
            <ToggleGroupItem key={key} value={key} className="justify-start gap-2.5 px-3">
              <span
                className="size-3 shrink-0 rounded-full border border-gold/30"
                style={{ backgroundColor: parts[key].color }}
              />
              {PART_LABELS[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="mt-3 text-[11px] leading-relaxed text-[#666666]">
          选中部件高亮显示，右侧滑块仅作用于当前部件
        </p>

        {/* 模型信息 */}
        <div className="mt-3 border-t border-gold/15 pt-3">
          <p className="truncate text-xs font-medium text-[#E5E5E5]">
            {project ? project.project_name : '写实鞋模 GLTF-01'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#666666]">
            {project
              ? projectError
                ? '模型加载失败，已切换内置鞋模'
                : `用户上传模型 · ${projectExt} 格式`
              : '实物扫描鞋模 · 8 材质 / 4 部件分组'}
          </p>
          {project && !projectError && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-gold/80">
              用户模型为整体材质，部件编辑仅作用于内置鞋模
            </p>
          )}
        </div>
      </div>

      {/* 用户模型加载失败提示 */}
      {projectError && (
        <div className="absolute bottom-24 left-5 z-10 max-w-72 rounded-xl border border-gold/25 bg-gold/10 px-4 py-2.5 text-xs text-gold backdrop-blur-xl">
          {projectError}
        </div>
      )}

      {/* 右侧浮动属性面板 */}
      <div className="absolute top-5 right-5 z-10 w-72 rounded-2xl border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-gold" />
          <h3 className="text-sm font-medium text-white">
            材质属性 · {PART_LABELS[selectedPart]}
          </h3>
        </div>

        {/* 当前部件颜色 */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="size-10 rounded-xl border border-gold/30 shadow-lg shadow-black/40"
            style={{ backgroundColor: current.color }}
          />
          <div>
            <p className="text-xs text-[#999999]">{PART_LABELS[selectedPart]}颜色</p>
            <p className="font-mono text-sm text-white uppercase">{current.color}</p>
          </div>
        </div>

        {/* 部件贴图（皮革纹理，spider 爬虫产物同步） */}
        {textures.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-[#999999]">部件贴图（皮革纹理）</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => selectTexture(null)}
                className={cn(
                  'flex h-12 items-center justify-center rounded-lg border text-xs transition-colors',
                  current.textureIndex === null
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-gold/20 text-[#999999] hover:text-[#E5E5E5]',
                )}
              >
                无贴图
              </button>
              {textures.map((t, i) => (
                <button
                  key={t.file}
                  type="button"
                  title={t.name}
                  onClick={() => selectTexture(i)}
                  className={cn(
                    'h-12 overflow-hidden rounded-lg border transition-transform hover:scale-105',
                    current.textureIndex === i ? 'border-gold' : 'border-gold/20',
                  )}
                >
                  <img
                    src={`/textures/${t.file}`}
                    alt={t.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
            {current.textureIndex !== null && (
              <div className="mt-3">
                <SliderRow
                  label="贴图密度"
                  en="Texture Repeat"
                  value={textureRepeat}
                  min={0.5}
                  max={4}
                  step={0.1}
                  onChange={setTextureRepeat}
                />
              </div>
            )}
          </div>
        )}

        {/* AI 配色结果 */}
        {palette.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-[#999999]">
              AI 配色方案
              {aiFallback && <span className="text-gold">（离线灵感池）</span>}
            </p>
            <div className="mt-2 flex gap-2">
              {palette.map((c, i) => (
                <button
                  key={c.hex + c.name}
                  type="button"
                  title={`${c.name} ${c.hex}${
                    PALETTE_PARTS[i] ? ` · 已分配至${PART_LABELS[PALETTE_PARTS[i]]}` : ''
                  }，点击设为当前部件颜色`}
                  onClick={() => updateSelectedPart({ color: c.hex })}
                  className={cn(
                    'h-8 flex-1 rounded-lg border transition-transform hover:scale-105',
                    current.color === c.hex ? 'border-gold/70' : 'border-gold/15',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#666666]">
              已分配：{PALETTE_PARTS.map((p) => PART_LABELS[p]).join(' · ')}
            </p>
          </div>
        )}

        {/* 材质滑块：仅控制当前选中部件 */}
        <div className="mt-5 space-y-5">
          <SliderRow
            label="粗糙度"
            en="Roughness"
            value={current.roughness}
            onChange={(v) => updateSelectedPart({ roughness: v })}
          />
          <SliderRow
            label="金属感"
            en="Metallic"
            value={current.metalness}
            onChange={(v) => updateSelectedPart({ metalness: v })}
          />
          <SliderRow
            label="透明度"
            en="Opacity"
            value={current.opacity}
            onChange={(v) => updateSelectedPart({ opacity: v })}
          />
          <SliderRow
            label="法线强度"
            en="Normal Intensity"
            value={current.normalScale}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => updateSelectedPart({ normalScale: v })}
          />
        </div>

        {/* 灯光预设 */}
        <div className="mt-5 border-t border-gold/15 pt-4">
          <p className="text-xs text-[#999999]">灯光预设</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(LIGHT_PRESETS) as LightKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setLightPreset(key)}
                className={cn(
                  'h-8 rounded-lg border text-xs transition-colors',
                  lightPreset === key
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-gold/20 bg-gold/5 text-[#999999] hover:text-[#E5E5E5]',
                )}
              >
                {LIGHT_PRESETS[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-gold/20 bg-[#121212] shadow-lg shadow-black/40 p-2 backdrop-blur-xl">
        <span className="hidden items-center gap-1.5 pr-1 pl-3 text-xs text-[#999999] md:flex">
          <MousePointer2 className="size-3" />
          拖拽旋转 · 滚轮缩放
        </span>
        <Button
          variant="ghost"
          size="icon"
          title="重置视角"
          onClick={() => controlsRef.current?.reset()}
          className="text-[#E5E5E5] hover:bg-gold/10 hover:text-gold-light"
        >
          <RotateCcw />
        </Button>
        <Button
          onClick={handleExport}
          className="gap-2 bg-gradient-to-r from-gold-light to-gold-dark text-[#241A08] hover:opacity-90"
        >
          <Download />
          导出 STL
        </Button>
        <Button
          variant="ghost"
          onClick={handleGenerate}
          disabled={aiLoading}
          className="gap-2 border border-gold/50 bg-transparent text-gold hover:bg-gold/10 hover:text-gold-light"
        >
          <Sparkles className={cn(aiLoading && 'animate-pulse')} />
          {aiLoading ? '生成中…' : 'AI 智能生成'}
        </Button>
      </div>
    </div>
  )
}
// 预加载写实鞋模，首次进入编辑器时更快呈现
useGLTF.preload(MODEL_URL, DRACO_PATH)
