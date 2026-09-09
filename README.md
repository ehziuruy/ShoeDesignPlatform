# ShoeDesignPlatform 鞋款设计平台

基于 **FastAPI + React + Three.js** 的 3D 鞋款设计平台项目骨架。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + SQLAlchemy + MySQL (PyMySQL) |
| 认证 | bcrypt（密码哈希）+ PyJWT（令牌） |
| 前端 | React 19 + TypeScript + Vite |
| 3D 渲染 | Three.js + @react-three/fiber + @react-three/drei |
| UI | Tailwind CSS 4 + shadcn/ui + Framer Motion |

## 目录结构

```
ShoeDesignPlatform/
├── backend/                           # FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py                  # 全局配置（.env 加载 / JWT / 上传目录）
│   │   ├── database.py                # SQLAlchemy 连接与会话管理
│   │   ├── models.py                  # User / Project ORM 模型
│   │   ├── auth.py                    # 注册 / 登录 / JWT 全局校验依赖
│   │   └── routers/
│   │       ├── projects.py            # 项目 CRUD + 模型上传下载（魔数校验）
│   │       └── ai.py                  # AI 配色（色彩理论生成：4 种方案）
│   ├── uploads/                       # 上传的模型文件存储目录
│   ├── main.py                        # FastAPI 入口（挂载路由 + 全局 JWT 依赖）
│   ├── init_db.py                     # 数据库初始化脚本（重建表，会清空数据）
│   ├── requirements.txt               # Python 依赖
│   └── schema.sql                     # MySQL 建库建表脚本
├── frontend/                          # React 19 + TypeScript 前端
│   ├── public/
│   │   ├── models/shoe-draco.glb      # GLTF 实物鞋模（本地化）
│   │   ├── draco/                     # Draco 解码器（本地化）
│   │   └── textures/                  # 皮革纹理 + 清单（爬虫产物同步）
│   ├── src/
│   │   ├── api/request.ts             # 统一 API 封装 + 错误拦截器
│   │   ├── components/
│   │   │   ├── AuthDialog.tsx         # 登录/注册对话框
│   │   │   ├── ConfirmDialog.tsx      # 通用确认对话框（危险操作）
│   │   │   ├── RenameDialog.tsx       # 重命名对话框
│   │   │   ├── UploadDialog.tsx       # 模型上传对话框
│   │   │   ├── Sidebar.tsx            # 240px 毛玻璃侧边栏（5 个导航页）
│   │   │   └── ui/                    # shadcn 组件（9 个）
│   │   ├── lib/utils.ts               # cn() 工具函数
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx          # 统计卡片 + 项目网格（上传/删除/重命名/状态切换）
│   │   │   ├── Editor.tsx             # 3D 编辑器（4 部件独立材质/法线强度/灯光预设）
│   │   │   ├── ColorsPage.tsx         # AI 配色工作台（点击复制 HEX）
│   │   │   ├── TeamPage.tsx           # 团队协作（占位页）
│   │   │   └── SettingsPage.tsx       # 设置（账号/偏好重置/关于）
│   │   ├── App.tsx                    # 布局 + hash 路由（前进/后退/刷新恢复）
│   │   ├── main.tsx
│   │   └── index.css                  # Tailwind v4 + shadcn 主题变量
│   ├── components.json                # shadcn/ui 配置
│   ├── package.json
│   └── vite.config.ts                 # /api 代理 + three 代码分割
├── spider/                            # 独立纹理爬虫
│   ├── texture_spider.py              # 双通道：Pexels 主 + 必应备（自动降级）
│   ├── requirements.txt
│   ├── textures.json                  # 索引：名称/URL/本地路径/大小/来源
│   └── downloads/                     # 已下载的皮革纹理
└── README.md
```

## 环境要求

- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## 后端启动

```bash
# 1. 进入后端目录
cd backend

# 2. 创建并激活虚拟环境
python -m venv venv
# Windows (PowerShell)
venv\Scripts\activate
# macOS / Linux
# source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 初始化数据库（需先在本机安装并启动 MySQL）
#    方式一：用项目自带的初始化脚本（会重建表并清空数据）
MYSQL_PASSWORD=你的密码 python init_db.py
#    方式二：直接执行 SQL 脚本
mysql -u root -p < schema.sql

# 5. 启动服务（默认运行在 http://localhost:8000）
#    Windows PowerShell 设置环境变量：
#    $env:DATABASE_URL = "mysql+pymysql://root:密码@localhost:3306/shoe_design_platform?charset=utf8mb4"
DATABASE_URL="mysql+pymysql://root:密码@localhost:3306/shoe_design_platform?charset=utf8mb4" \
  uvicorn main:app --reload --port 8000
```

启动后访问 http://localhost:8000/api/health 应返回：

```json
{ "status": "ok", "message": "Hello World" }
```

交互式 API 文档：http://localhost:8000/docs

## API 接口一览

| 方法 | 路径 | 认证 | 说明 |
|------|------|:----:|------|
| POST | /api/auth/register | - | 注册（username / password / email 可选） |
| POST | /api/auth/login | - | 登录，返回 2 小时有效期的 JWT |
| GET | /api/projects | Bearer Token | 当前用户的全部项目（含真实文件大小，按创建时间倒序） |
| GET | /api/projects/{id} | Bearer Token | 项目详情（刷新恢复编辑器状态用） |
| PATCH | /api/projects/{id} | Bearer Token | 更新项目：重命名 / 状态流转 |
| DELETE | /api/projects/{id} | Bearer Token | 删除项目（连同模型文件） |
| GET | /api/projects/{id}/file | Bearer Token | 下载项目模型文件（编辑器加载用） |
| POST | /api/upload | Bearer Token | 上传 .obj / .stl 模型（含文件头魔数校验） |
| GET | /api/ai/generate-colors | Bearer Token | 基于色彩理论生成 5 组配色（单色系/邻近色/互补色/三角配色） |
| GET | /api/health | - | 健康检查（供监控探活，保留公开） |

> 所有业务接口（除 /api/auth 和 /api/health 外）均需在请求头携带
> `Authorization: Bearer <access_token>`，否则返回 401。

## 前端启动

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器（默认运行在 http://localhost:5173）
npm run dev
```

> shadcn/ui 已初始化完成（radix 组件库 + Nova 预设，配置见 frontend/components.json），
> 已内置 button / card / input / label 组件。后续添加新组件使用：
>
> ```bash
> npx shadcn@latest add dialog dropdown-menu avatar ...
> ```

前端代码中所有 `/api` 开头的请求会被 Vite 自动代理到后端 `http://localhost:8000`，
因此不存在跨域问题（后端也已单独配置了 CORS 白名单）。

## 纹理爬虫（spider/）

独立工具：抓取免费皮革纹理图片，供 3D 编辑器用作材质贴图。

```bash
cd spider
pip install -r requirements.txt

python texture_spider.py                    # 默认抓取 5 张 leather 纹理
python texture_spider.py --count 3          # 自定义数量
python texture_spider.py --keyword fabric   # 自定义关键词
```

抓取策略（自动降级）：主通道为 BeautifulSoup 解析 Pexels 搜索页；
若被 Cloudflare 等 WAF 拦截（无法执行 JS 挑战），自动切换必应图片搜索
提取图片直链。产物：`spider/downloads/`（图片）+ `spider/textures.json`（索引）。

**接入 3D 编辑器**：爬取的纹理需同步到前端静态目录后，编辑器右侧面板
即可选择皮革纹理作为鞋面贴图（`meshPhysicalMaterial.map`）：

```bash
# 同步纹理与清单到 frontend/public/textures/
cp spider/downloads/*.jpg frontend/public/textures/
python -X utf8 -c "import json;from pathlib import Path;m=json.load(open('spider/textures.json',encoding='utf-8'));Path('frontend/public/textures/textures.json').write_text(json.dumps({'source':'spider','count':len(m['textures']),'textures':[{'name':t['name'],'file':Path(t['local_path']).name} for t in m['textures']]},ensure_ascii=False,indent=2),encoding='utf-8')"
```

## 生产构建

```bash
cd frontend
npm run build     # 产物输出到 frontend/dist
npm run preview   # 本地预览生产构建
```
