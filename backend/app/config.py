"""全局配置：从环境变量读取，便于区分开发/生产环境。"""

import os

# 项目根目录（backend/）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 优先加载 backend/.env 中的本地配置（DATABASE_URL / JWT_SECRET_KEY 等）
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    pass  # 未安装 python-dotenv 时退化为纯环境变量

# 数据库连接（默认本机 MySQL，生产环境请通过环境变量 DATABASE_URL 覆盖）
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:root@localhost:3306/shoe_design_platform?charset=utf8mb4",
)

# JWT 配置（生产环境务必通过环境变量 JWT_SECRET_KEY 覆盖默认值）
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-CHANGE-ME-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120  # 2 小时

# 文件上传配置
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
