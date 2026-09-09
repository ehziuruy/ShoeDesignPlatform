import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, router as auth_router
from app.config import UPLOAD_DIR
from app.routers import ai, projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时创建上传目录。"""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(title="ShoeDesignPlatform API", version="0.1.0", lifespan=lifespan)

# CORS 配置：允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 路由挂载 ----------
# 公开路由：注册 / 登录（/api/auth/*），无需 Token
app.include_router(auth_router)

# 受保护路由：挂载时注入全局 JWT 依赖，
# /api/auth 之外的所有业务接口都必须携带有效 Token 才能访问
app.include_router(projects.router, dependencies=[Depends(get_current_user)])
app.include_router(ai.router, dependencies=[Depends(get_current_user)])


@app.get("/api/health")
def health_check():
    """健康检查接口（保留公开，供负载均衡 / 监控探活使用）。"""
    return {"status": "ok", "message": "Hello World"}
