"""开发环境演示数据填充：为指定用户生成一批"真实可打开"的鞋款演示项目。

演示模型复用编辑器同款 Draco 压缩鞋模（frontend/public/models/shoe-draco.glb），
通过修改 GLB 内嵌 JSON 的材质 baseColorFactor 生成不同配色款，并按项目
复制为独立文件（互不影响删除）。归档项目使用稀疏文件占位逻辑大小。

用法：
    python seed_demo.py               # 默认为 admin123 用户填充
    python seed_demo.py testuser      # 指定用户名

可重复执行：脚本会先清掉该用户 file_path 以 uploads/demo- 开头的旧演示数据
（含磁盘文件），再重新生成；用户真实上传的项目不受影响。
"""

import json
import os
import struct
import sys
import uuid
from pathlib import Path

import pymysql

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
SHOE_GLB = BASE_DIR.parent / "frontend" / "public" / "models" / "shoe-draco.glb"

# 总览页存储配额 50GB，目标展示约 60% 用量
TARGET_TOTAL_BYTES = 30_000_000_000

# 鞋模 8 个材质部件名（与 GLB 内嵌 JSON 一致）
PARTS = ("laces", "mesh", "caps", "inner", "sole", "stripes", "band", "patch")


def _rgb(hex_color: str) -> list[float]:
    """'#RRGGBB' -> GLTF baseColorFactor（线性近似，0-1 浮点）。"""
    value = int(hex_color.lstrip('#'), 16)
    return [round(((value >> 16) & 255) / 255, 4), round(((value >> 8) & 255) / 255, 4), round((value & 255) / 255, 4), 1]


def write_shoe_glb(path: Path, colorway: dict[str, str], pad: int) -> None:
    """复制鞋模 GLB 并改写配色；pad 追加到 JSON 块（伪装文件体积差异）。

    GLB 结构：12 字节头 + JSON 块（4 字节对齐，可追加空格）+ BIN 块。
    Draco 压缩的几何数据在 BIN 块中，原样保留。
    """
    data = SHOE_GLB.read_bytes()
    json_len, _ = struct.unpack("<II", data[12:20])
    gltf = json.loads(data[20 : 20 + json_len])

    for material in gltf["materials"]:
        color = colorway.get(material["name"])
        if color:
            material.setdefault("pbrMetallicRoughness", {})["baseColorFactor"] = _rgb(color)

    new_json = json.dumps(gltf, separators=(",", ":")).encode()
    # 对齐填充 + 体积伪装填充（均为空格，GLB 规范允许）
    padding = ((-(len(new_json) + pad)) % 4 + pad) if pad else (-len(new_json)) % 4
    json_chunk = new_json + b" " * padding
    rest = data[20 + json_len :]
    total = 12 + 8 + len(json_chunk) + len(rest)

    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_chunk), 0x4E4F534A))
        f.write(json_chunk)
        f.write(rest)


# 演示项目：(项目名, 配色, 伪装填充字节, 状态, 创建时间)
DEMO_PROJECTS = [
    ("曜石金翼跑鞋", {
        "laces": "#F2B852", "mesh": "#141414", "caps": "#D9A441", "inner": "#1A1A1A",
        "sole": "#0B0B0B", "stripes": "#D9A441", "band": "#F2B852", "patch": "#E08F20",
    }, 0, "producing", "2026-08-28 16:20:00"),
    ("鎏金德训复古", {
        "laces": "#EDE3D0", "mesh": "#C8B89A", "caps": "#8A7455", "inner": "#B0A48C",
        "sole": "#6B5B45", "stripes": "#A08A64", "band": "#C8B89A", "patch": "#8A7455",
    }, 2048, "draft", "2026-08-25 11:05:00"),
    ("琥珀竞速概念 X9", {
        "laces": "#F2B852", "mesh": "#2A2118", "caps": "#B57B22", "inner": "#241C12",
        "sole": "#E8A33D", "stripes": "#F2B852", "band": "#D9A441", "patch": "#E08F20",
    }, 4096, "producing", "2026-08-22 09:42:00"),
    ("玄铁都市通勤", {
        "laces": "#4A4E55", "mesh": "#23262B", "caps": "#33363C", "inner": "#1B1E22",
        "sole": "#15171A", "stripes": "#5C6169", "band": "#3A3E45", "patch": "#6B7078",
    }, 8192, "draft", "2026-08-18 15:30:00"),
    ("白金典藏限量", {
        "laces": "#E5E0D2", "mesh": "#F5F2EA", "caps": "#D9A441", "inner": "#DDD8CA",
        "sole": "#E8E4D8", "stripes": "#D9A441", "band": "#F2B852", "patch": "#C79A3B",
    }, 16384, "producing", "2026-08-14 20:12:00"),
    ("青鸾霓光概念", {
        "laces": "#22D3EE", "mesh": "#0E1A1E", "caps": "#0F2A2E", "inner": "#132024",
        "sole": "#10191C", "stripes": "#22D3EE", "band": "#67E8F9", "patch": "#0E7490",
    }, 32768, "producing", "2026-08-09 10:28:00"),
    ("暗夜猎手越野", {
        "laces": "#7F1D1D", "mesh": "#1C1113", "caps": "#450A0A", "inner": "#201316",
        "sole": "#120C0D", "stripes": "#B91C1C", "band": "#EF4444", "patch": "#7F1D1D",
    }, 65536, "producing", "2026-08-04 14:55:00"),
    ("晨曦轻跑 Lite", {
        "laces": "#E7E5E4", "mesh": "#D6D3D1", "caps": "#78716C", "inner": "#C9C5C1",
        "sole": "#A8A29E", "stripes": "#A8A29E", "band": "#D6D3D1", "patch": "#8A8580",
    }, 131072, "draft", "2026-07-28 08:16:00"),
    ("熔岩锻造高帮", {
        "laces": "#FF5A1F", "mesh": "#27130A", "caps": "#7C2D12", "inner": "#231209",
        "sole": "#1A0E07", "stripes": "#EA580C", "band": "#FB923C", "patch": "#C2410C",
    }, 262144, "producing", "2026-07-22 19:40:00"),
    ("霜银极简 Mule", {
        "laces": "#DCE1E6", "mesh": "#C0C7CE", "caps": "#9AA3AB", "inner": "#B4BBC2",
        "sole": "#8E979F", "stripes": "#AAB2BA", "band": "#C7CDD3", "patch": "#8E979F",
    }, 524288, "draft", "2026-07-15 13:22:00"),
    ("赤霞流线滑板", {
        "laces": "#FCA5A5", "mesh": "#7F1D1D", "caps": "#5B1414", "inner": "#601414",
        "sole": "#3B0A0A", "stripes": "#EF4444", "band": "#F87171", "patch": "#991B1B",
    }, 786432, "producing", "2026-08-30 09:15:00"),
    ("墨玉棋盘经典", {
        "laces": "#F5F5F5", "mesh": "#17171A", "caps": "#101012", "inner": "#202024",
        "sole": "#26262B", "stripes": "#FFFFFF", "band": "#D4D4D8", "patch": "#3F3F46",
    }, 1572864, "draft", "2026-08-27 21:33:00"),
    ("苍穹缓震 Sphere", {
        "laces": "#D6E8F5", "mesh": "#A5CAE3", "caps": "#6F9BB8", "inner": "#B5D0E4",
        "sole": "#5B87A6", "stripes": "#7EB3D8", "band": "#A5CAE3", "patch": "#5B87A6",
    }, 32768, "producing", "2026-08-20 17:48:00"),
    ("翡翠旋管", {
        "laces": "#34D399", "mesh": "#0E2620", "caps": "#065F46", "inner": "#10241D",
        "sole": "#091813", "stripes": "#10B981", "band": "#6EE7B7", "patch": "#047857",
    }, 65536, "producing", "2026-08-12 10:05:00"),
    ("曜白极简小白", {
        "laces": "#FAFAF8", "mesh": "#F7F7F5", "caps": "#E3E3DF", "inner": "#F2F2F0",
        "sole": "#EDEDEA", "stripes": "#E8E8E5", "band": "#F7F7F5", "patch": "#DDDDD8",
    }, 131072, "draft", "2026-08-07 14:22:00"),
    ("钛灰登山靴", {
        "laces": "#E08F20", "mesh": "#3A3E43", "caps": "#4A4E53", "inner": "#333639",
        "sole": "#2B2E32", "stripes": "#E08F20", "band": "#6B7075", "patch": "#F2B852",
    }, 262144, "producing", "2026-07-30 19:10:00"),
    ("流金拖鞋 Nature", {
        "laces": "#F2DBA0", "mesh": "#E5C97A", "caps": "#C9A44B", "inner": "#D9BC72",
        "sole": "#B08A3E", "stripes": "#F2B852", "band": "#E8CE85", "patch": "#A67C2E",
    }, 524288, "draft", "2026-07-18 08:40:00"),
]

# 大体积"归档"项目：稀疏文件占位（逻辑大小真实、磁盘几乎不占）。
# 编辑器对 >100MB 的模型会直接提示"文件过大"而不加载，点击安全。
# (项目名, 逻辑大小[字节], 扩展名, 状态, 创建时间)；最后一项大小由脚本自动补齐
ARCHIVE_PROJECTS = [
    ("高精扫描原档 · 飞翼", 6_800_000_000, ".obj", "producing", "2026-07-02 15:10:00"),
    ("渲染母版 · 琥珀 X9", 5_200_000_000, ".stl", "producing", "2026-06-26 10:35:00"),
    ("全息扫描 · 曜石", 4_400_000_000, ".obj", "draft", "2026-06-19 20:05:00"),
    ("竞速工装母版", 3_700_000_000, ".obj", "producing", "2026-06-12 13:48:00"),
    ("越野高模原档", 2_900_000_000, ".stl", "producing", "2026-06-05 09:22:00"),
    ("典藏扫描全集", 2_200_000_000, ".obj", "draft", "2026-05-29 16:40:00"),
    ("陈列高模档案", 1_600_000_000, ".obj", "producing", "2026-05-22 11:15:00"),
    ("旗舰店定制母版", None, ".stl", "producing", "2026-05-15 14:30:00"),  # None = 自动补齐
]


def write_sparse(path: Path, logical_size: int) -> None:
    """生成逻辑大小为 logical_size 的稀疏文件。

    先用 FSCTL_SET_SPARSE 标记稀疏再扩展：stat 报告完整逻辑大小
    （总览页据此计算存储占用），磁盘实际只分配几 KB。
    """
    import ctypes

    FSCTL_SET_SPARSE = 0x900C4
    GENERIC_WRITE, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL = 0x40000000, 3, 0x80

    with open(path, "wb") as f:
        f.write(b"# archived master mesh (sparse placeholder)\n")

    k32 = ctypes.windll.kernel32
    handle = k32.CreateFileW(str(path), GENERIC_WRITE, 0, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None)
    if handle not in (0, -1):
        returned = ctypes.c_ulong()
        k32.DeviceIoControl(handle, FSCTL_SET_SPARSE, None, 0, None, 0, ctypes.byref(returned), None)
        k32.CloseHandle(handle)

    with open(path, "r+b") as f:
        f.seek(logical_size - 1)
        f.write(b"\n")


def load_conn_params() -> dict:
    """从 backend/.env 或环境变量读取 DATABASE_URL，解析为 pymysql 连接参数。"""
    url = os.getenv("DATABASE_URL")
    if not url:
        env_file = BASE_DIR / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    if not url:
        url = "mysql+pymysql://root:root@localhost:3306/shoe_design_platform?charset=utf8mb4"

    import re

    match = re.match(
        r"mysql\+pymysql://(?P<user>[^:]+):(?P<password>[^@]+)@(?P<host>[^:/]+):(?P<port>\d+)",
        url,
    )
    if match is None:
        raise SystemExit(f"无法解析 DATABASE_URL: {url}")
    return {
        "host": match["host"],
        "port": int(match["port"]),
        "user": match["user"],
        "password": match["password"],
        "database": "shoe_design_platform",
        "charset": "utf8mb4",
    }


def main() -> None:
    username = sys.argv[1] if len(sys.argv) > 1 else "admin123"
    if not SHOE_GLB.is_file():
        raise SystemExit(f"找不到鞋模文件: {SHOE_GLB}")
    conn = pymysql.connect(**load_conn_params())

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            if row is None:
                raise SystemExit(f"用户 {username!r} 不存在，请先在前端注册")
            user_id = row[0]

            # 清理旧的演示数据（仅 demo- 前缀，不动真实上传）
            cur.execute(
                "SELECT file_path FROM projects WHERE user_id = %s AND file_path LIKE 'uploads/demo-%%'",
                (user_id,),
            )
            for (file_path,) in cur.fetchall():
                target = (BASE_DIR / file_path).resolve()
                if target.is_relative_to(UPLOAD_DIR.resolve()) and target.is_file():
                    target.unlink()
            cur.execute(
                "DELETE FROM projects WHERE user_id = %s AND file_path LIKE 'uploads/demo-%%'",
                (user_id,),
            )

            UPLOAD_DIR.mkdir(exist_ok=True)
            inserted = []
            for name, colorway, pad, status, created_at in DEMO_PROJECTS:
                print(f"生成鞋款: {name} ...", flush=True)
                stored = f"demo-{uuid.uuid4().hex}.glb"
                path = UPLOAD_DIR / stored
                write_shoe_glb(path, colorway, pad)

                cur.execute(
                    "INSERT INTO projects (user_id, project_name, file_path, status, created_at) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (user_id, name, f"uploads/{stored}", status, created_at),
                )
                inserted.append((name, path.stat().st_size, ".glb"))

            # 大体积归档项目：稀疏文件补齐到目标总用量（约 60% 配额）
            real_total = sum(size for _, size, _ in inserted)
            fixed_archives = sum(size for _, size, _, _, _ in ARCHIVE_PROJECTS if size is not None)
            remainder = TARGET_TOTAL_BYTES - real_total - fixed_archives
            if remainder < 500_000_000:
                raise SystemExit(f"归档配额计算异常：补齐值仅 {remainder / 1e9:.2f} GB")

            print(f"\n生成 {len(ARCHIVE_PROJECTS)} 个归档稀疏文件（补齐后总用量 ~{TARGET_TOTAL_BYTES / 1e9:.0f} GB）...")
            for name, size, ext, status, created_at in ARCHIVE_PROJECTS:
                logical = size if size is not None else remainder
                stored = f"demo-archive-{uuid.uuid4().hex}{ext}"
                path = UPLOAD_DIR / stored
                write_sparse(path, logical)

                cur.execute(
                    "INSERT INTO projects (user_id, project_name, file_path, status, created_at) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (user_id, name, f"uploads/{stored}", status, created_at),
                )
                inserted.append((name, path.stat().st_size, ext))
            conn.commit()

            print(f"\n已为用户 {username!r} 填充 {len(inserted)} 个演示项目：")
            total = 0
            for name, size, ext in inserted:
                total += size
                size_text = f"{size / 1e9:.1f} GB" if size >= 1_000_000_000 else f"{size / 1024:.1f} KB"
                print(f"  {name:<16} {size_text:>10}  {ext}")
            print(f"合计: {total / 1e9:.1f} GB（配额 50GB 的 {total / 50e9 * 100:.0f}%）")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
