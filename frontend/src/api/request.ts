/**
 * 后端 API 统一封装。
 *
 * - 请求拦截：自动注入 JWT Token（登录/注册等接口可通过 skipAuth 跳过）
 * - 错误拦截：401 会话失效自动清除凭据并广播全局事件、超时中断、
 *   网络异常与业务错误（后端 detail 字段）统一抛出 ApiError
 * - 所有请求经 Vite 代理（/api -> http://localhost:8000），与后端同源
 */

const TOKEN_KEY = 'sdp_token'
const USERNAME_KEY = 'sdp_username'
const BASE_URL = '/api'
const DEFAULT_TIMEOUT_MS = 15000

/** 401 会话失效时派发的全局事件名，App 层监听后重置登录态 UI */
export const UNAUTHORIZED_EVENT = 'sdp:unauthorized'

// ---------------- 类型定义 ----------------

export interface Project {
  id: number
  project_name: string
  file_path: string
  status: string
  created_at: string
  /** 模型文件真实大小（字节），文件丢失时为 null */
  file_size?: number | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface ColorScheme {
  name: string
  hex: string
}

// ---------------- 错误类型 ----------------

/** 统一 API 错误：status 为 -1 表示网络层错误（请求未到达服务器） */
export class ApiError extends Error {
  readonly status: number
  /** 服务端返回的原始 detail（如有） */
  readonly detail?: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// ---------------- 凭据存储 ----------------

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUsername: () => localStorage.getItem(USERNAME_KEY),
  save(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USERNAME_KEY, username)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
  },
}

// ---------------- 请求封装 ----------------

interface RequestOptions {
  method?: string
  body?: BodyInit
  timeout?: number
  /** 登录/注册等本身不需要 Token 的接口设为 true，其 401 也不触发会话清除 */
  skipAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeout = DEFAULT_TIMEOUT_MS, skipAuth = false } = options

  const headers: Record<string, string> = {}
  // FormData（文件上传）由浏览器自动设置 multipart 边界，不能手动指定 Content-Type
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const token = auth.getToken()
  if (token && !skipAuth) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`请求超时（${timeout / 1000} 秒）：${path}`, -1)
    }
    throw new ApiError('网络连接失败，请检查后端服务是否已启动', -1)
  } finally {
    clearTimeout(timer)
  }

  // ---------------- 错误拦截 ----------------
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { detail?: string } | null

    // 业务接口 401：Token 过期/无效，清除本地凭据并广播，App 层重置登录态
    if (res.status === 401 && !skipAuth) {
      auth.clear()
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }

    throw new ApiError(data?.detail ?? `请求失败（HTTP ${res.status}）`, res.status, data?.detail)
  }

  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

// ---------------- 业务接口 ----------------

export const api = {
  /**
   * 注册新用户（注册成功后仍需调用 login 获取 Token）。
   * 用户名 2-50 字符，密码 6-72 字节。
   */
  register: (username: string, password: string, email?: string) =>
    request<{ id: number; username: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email }),
      skipAuth: true,
    }),

  /** 登录：校验密码，返回 2 小时有效期的 JWT access_token */
  login: (username: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuth: true,
    }),

  /** 获取当前登录用户的项目列表（按创建时间倒序，含文件大小） */
  getProjects: () => request<Project[]>('/projects'),

  /** 获取单个项目详情（刷新后恢复编辑器状态用） */
  getProject: (id: number) => request<Project>(`/projects/${id}`),

  /** 更新项目：重命名（project_name）与状态流转（status） */
  updateProject: (id: number, data: { project_name?: string; status?: string }) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** 删除项目（连同磁盘上的模型文件） */
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  /**
   * 上传 .obj / .stl 模型文件（后端做文件头魔数校验）。
   * @param file 用户选择的模型文件
   * @param projectName 项目名称（可选，默认为文件名）
   */
  uploadFile: (file: File, projectName?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (projectName) {
      form.append('project_name', projectName)
    }
    return request<Project>('/upload', { method: 'POST', body: form })
  },

  /** AI 配色生成：返回 5 组随机配色方案 */
  generateColors: () => request<ColorScheme[]>('/ai/generate-colors'),
}
