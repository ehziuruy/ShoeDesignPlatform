"""项目与文件管理模块：项目 CRUD + 模型文件上传与下载。"""

import os
import struct
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import BASE_DIR, MAX_UPLOAD_SIZE, UPLOAD_DIR
from app.database import get_db
from app.models import Project, User

router = APIRouter(prefix="/api", tags=["项目与文件管理 Projects"])

ALLOWED_EXTENSIONS = {".obj", ".stl"}
ALLOWED_STATUS = {"draft", "editing", "producing", "completed", "archived"}


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_name: str
    file_path: str
    status: str
    created_at: datetime
    file_size: int | None = None


class ProjectUpdateRequest(BaseModel):
    project_name: str | None = Field(default=None, min_length=1, max_length=100)
    status: str | None = None


# ---------- 文件头魔数校验 ----------


def validate_model_file(filename: str, content: bytes) -> str | None:
    """校验模型文件头，合法返回 None，否则返回错误原因。

    - .obj：纯文本格式（无二进制魔数），前 4 字节必须全部为可打印 ASCII 字符
    - .stl：ASCII 格式以 "solid" 开头（前 4 字节为 b"soli"）；
            二进制格式为 80 字节头 + 4 字节三角面数量 + 50*n 字节三角形数据，
            通过文件长度公式校验结构完整性
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"不支持的文件类型 {ext or '(无扩展名)'}，仅支持 .obj / .stl"

    header = content[:4]

    if ext == ".obj":
        if len(header) < 4 or not all(0x20 <= b <= 0x7E for b in header):
            return "OBJ 文件头校验失败：前 4 字节不是可打印 ASCII 文本"
        return None

    # ---- STL ----
    # ASCII STL：前 4 字节为 b"soli"（"solid" 前缀），且首段内容含 facet 关键字
    # （防止二进制 STL 的 80 字节头恰好以 "solid" 开头被误判）
    if header == b"soli" and b"facet" in content[:1024]:
        return None

    # 二进制 STL：结构校验（总长度必须精确等于 84 + 50 * 三角面数量）
    if len(content) >= 84:
        triangle_count = struct.unpack("<I", content[80:84])[0]
        expected_size = 84 + 50 * triangle_count
        if len(content) == expected_size:
            return None
        return (
            f"STL 二进制结构校验失败：期望文件大小 {expected_size} 字节，"
            f"实际 {len(content)} 字节"
        )

    return "STL 文件头校验失败：文件过短或不是有效的 STL 文件"


# ---------- 内部工具 ----------


def _resolve_upload_path(file_path: str) -> Path:
    """解析项目文件路径并限定在 uploads/ 目录内（防路径穿越）。"""
    full = (Path(BASE_DIR) / file_path).resolve()
    uploads_root = Path(UPLOAD_DIR).resolve()
    if not full.is_relative_to(uploads_root):
        raise HTTPException(status_code=400, detail="非法文件路径")
    return full


def _project_to_out(project: Project) -> ProjectOut:
    """ORM 对象转响应模型，附带磁盘上的真实文件大小。"""
    out = ProjectOut.model_validate(project)
    try:
        out.file_size = _resolve_upload_path(project.file_path).stat().st_size
    except (HTTPException, OSError):
        out.file_size = None  # 文件丢失或路径异常时不阻塞列表展示
    return out


def _get_owned_project(project_id: int, current_user: User, db: Session) -> Project:
    """按 ID 取当前用户的项目；不存在或非本人一律 404（不泄露存在性）。"""
    project = db.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


# ---------- 项目 CRUD 路由 ----------


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前登录用户的全部项目（含真实文件大小），按创建时间倒序。"""
    projects = db.scalars(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc(), Project.id.desc())
    ).all()
    return [_project_to_out(p) for p in projects]


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单个项目详情（刷新页面后恢复编辑器状态用）。"""
    return _project_to_out(_get_owned_project(project_id, current_user, db))


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    request: ProjectUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新项目：重命名（project_name）与状态流转（status）。"""
    project = _get_owned_project(project_id, current_user, db)

    if request.project_name is not None:
        project.project_name = request.project_name
    if request.status is not None:
        if request.status not in ALLOWED_STATUS:
            raise HTTPException(
                status_code=400,
                detail=f"非法状态 {request.status}，允许值：{sorted(ALLOWED_STATUS)}",
            )
        project.status = request.status

    db.commit()
    db.refresh(project)
    return _project_to_out(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除项目：连同磁盘上的模型文件一并删除。"""
    project = _get_owned_project(project_id, current_user, db)

    try:
        full = _resolve_upload_path(project.file_path)
        if full.is_file():
            full.unlink()
    except HTTPException:
        pass  # 路径异常时仍删除数据库记录，避免出现无法清理的脏数据

    db.delete(project)
    db.commit()
    return None


@router.get("/projects/{project_id}/file")
def download_project_file(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载项目的模型文件（编辑器加载用户上传模型用，需鉴权）。"""
    project = _get_owned_project(project_id, current_user, db)
    full = _resolve_upload_path(project.file_path)
    if not full.is_file():
        raise HTTPException(status_code=404, detail="模型文件已丢失")
    return FileResponse(full, filename=full.name, media_type="application/octet-stream")


# ---------- 文件上传路由 ----------


@router.post("/upload", response_model=ProjectOut, status_code=201)
async def upload_model(
    file: UploadFile = File(..., description=".obj 或 .stl 模型文件"),
    project_name: str | None = Form(
        default=None, max_length=100, description="项目名称（可选，默认为文件名）"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传 3D 模型文件：魔数校验 -> 存入 ./uploads -> 写入 projects 表。"""
    if file.filename is None:
        raise HTTPException(status_code=400, detail="缺少文件名")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大：{len(content)} 字节，上限 {MAX_UPLOAD_SIZE} 字节",
        )

    error = validate_model_file(file.filename, content)
    if error is not None:
        raise HTTPException(status_code=400, detail=error)

    # 魔数校验通过：以 UUID 重命名存储，避免文件名冲突与路径穿越
    ext = Path(file.filename).suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(stored_path, "wb") as f:
        f.write(content)

    # 默认项目名 = 原始文件名（去扩展名、去路径），截断到 100 字符
    original_name = Path(file.filename).stem
    name = (project_name or original_name or "未命名项目")[:100]

    project = Project(
        user_id=current_user.id,
        project_name=name,
        file_path=f"uploads/{stored_name}",
        status="draft",
    )
    db.add(project)
    try:
        db.commit()
    except Exception:
        # 数据库写入失败时回滚并删除已落盘文件，避免产生孤儿文件
        db.rollback()
        if os.path.exists(stored_path):
            os.remove(stored_path)
        raise HTTPException(status_code=500, detail="数据库写入失败，已删除上传的文件")

    db.refresh(project)
    return _project_to_out(project)
