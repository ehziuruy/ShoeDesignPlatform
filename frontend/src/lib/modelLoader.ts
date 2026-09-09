import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { auth } from '@/api/request'

/** 浏览器端单模型加载上限（真实上传被后端限制在 50MB，超出此值的只可能是演示归档文件） */
export const MAX_BROWSER_MODEL_BYTES = 100 * 1024 * 1024

/** 是否可在浏览器端加载（预览 / 编辑）；超大归档文件直接拒绝 */
export function isModelLoadable(fileSize: number | null | undefined): boolean {
  return fileSize == null || fileSize <= MAX_BROWSER_MODEL_BYTES
}

export interface LoadedModel {
  object: THREE.Object3D
  /** GLB：自带多材质（8 部件配色），原样渲染；OBJ/STL：单材质模型，几何体由调用方上材质 */
  isGltf: boolean
}

/** 带鉴权拉取项目模型文件 */
async function fetchProjectFile(projectId: number): Promise<Response> {
  const token = auth.getToken()
  const res = await fetch(`/api/projects/${projectId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    throw new Error(`模型文件下载失败（HTTP ${res.status}）`)
  }
  return res
}

const gltfLoader = (() => {
  const draco = new DRACOLoader()
  draco.setDecoderPath('/draco/')
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  return loader
})()

/** 加载项目模型：按扩展名分派到 GLTF / OBJ / STL Loader */
export async function loadProjectModel(
  project: Pick<import('@/api/request').Project, 'id' | 'file_path' | 'file_size'>,
): Promise<LoadedModel> {
  if (!isModelLoadable(project.file_size)) {
    const size = project.file_size ?? 0
    throw new Error(`模型文件过大（${(size / 1e9).toFixed(1)} GB），超出浏览器加载范围`)
  }

  const ext = project.file_path.split('.').pop()?.toLowerCase()
  const res = await fetchProjectFile(project.id)

  if (ext === 'glb') {
    const buffer = await res.arrayBuffer()
    const gltf: GLTF = await new Promise((resolve, reject) => {
      gltfLoader.parse(buffer, '', resolve, reject)
    })
    return { object: gltf.scene, isGltf: true }
  }

  if (ext === 'stl') {
    const geometry = new STLLoader().parse(await res.arrayBuffer())
    if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
      throw new Error('模型文件中没有网格数据')
    }
    return { object: new THREE.Mesh(geometry), isGltf: false }
  }

  const group = new OBJLoader().parse(await res.text())
  let meshCount = 0
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      meshCount += 1
      if (!mesh.geometry.attributes.normal) {
        mesh.geometry.computeVertexNormals()
      }
    }
  })
  if (meshCount === 0) {
    throw new Error('模型文件中没有网格数据')
  }
  return { object: group, isGltf: false }
}
