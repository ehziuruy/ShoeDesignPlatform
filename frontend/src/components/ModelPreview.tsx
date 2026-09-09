import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FileBox, Loader2 } from 'lucide-react'
import type { Project } from '@/api/request'
import { isModelLoadable, loadProjectModel } from '@/lib/modelLoader'

/** 非 GLB 用户模型（OBJ/STL）的统一预览材质：哑光金属金 */
const PREVIEW_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#D9A441',
  metalness: 0.65,
  roughness: 0.35,
})

/** 懒挂载：进入视口才渲染内容（离开即卸载 Canvas，控制 WebGL 上下文数量） */
function useInView(rootMargin = '150px') {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, inView }
}

/** 自转 + 归一化的模型呈现（画布内） */
function SpinningModel({ object, isGltf }: { object: THREE.Object3D; isGltf: boolean }) {
  const spinRef = useRef<THREE.Group>(null)

  // OBJ/STL 换成统一预览材质（GLB 保留自带配色）
  useEffect(() => {
    if (isGltf) return
    object.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals()
        mesh.material = PREVIEW_MATERIAL
      }
    })
  }, [object, isGltf])

  // 归一化：包围盒居中 + 统一尺寸
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = 1.7 / Math.max(size.x, size.y, size.z, 0.001)
    object.scale.setScalar(scale)
    object.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
  }, [object])

  useFrame((_, delta) => {
    if (spinRef.current) spinRef.current.rotation.y += delta * 0.45
  })

  return (
    <group ref={spinRef} rotation={[0.08, 0.6, 0]}>
      <primitive object={object} />
    </group>
  )
}

/** 项目卡片动态 3D 预览：加载项目模型并缓慢自转；归档大文件 / 加载失败退化为图标占位 */
export function ModelPreview({ project }: { project: Project }) {
  const { ref, inView } = useInView()
  const loadable = isModelLoadable(project.file_size)
  const [object, setObject] = useState<THREE.Object3D | null>(null)
  const [isGltf, setIsGltf] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!inView || !loadable) return
    let cancelled = false
    setFailed(false)
    setObject(null)
    loadProjectModel(project)
      .then((loaded) => {
        if (cancelled) return
        setObject(loaded.object)
        setIsGltf(loaded.isGltf)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [inView, loadable, project.id, project.file_path, project.file_size])

  // 归档大文件或加载失败：图标占位
  if (!loadable || failed) {
    return (
      <div ref={ref} className="absolute inset-0 flex items-center justify-center">
        <FileBox className="size-10 text-[#666666]" />
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute inset-0">
      {inView ? (
        object ? (
          <Canvas
            dpr={1}
            camera={{ position: [0, 0.55, 2.6], fov: 35 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
            style={{ pointerEvents: 'none' }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 5, 2]} intensity={1.6} />
            <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#d9a441" />
            <SpinningModel object={object} isGltf={isGltf} />
          </Canvas>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-gold/60" />
          </div>
        )
      ) : null}
    </div>
  )
}
