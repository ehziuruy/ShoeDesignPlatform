"""数据库初始化脚本：执行 schema.sql 建库建表。

用法：
    python init_db.py                     # 使用环境变量 DATABASE_URL（或默认 root）
    MYSQL_PASSWORD=xxx python init_db.py  # 通过环境变量传密码

脚本会先删除已存在的 projects / users 表再重建（数据会清空，仅用于开发环境）。
"""

import os
import re

import pymysql


def main() -> None:
    # 从 DATABASE_URL 解析连接参数，兜底默认值
    url = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:root@localhost:3306/shoe_design_platform?charset=utf8mb4",
    )
    match = re.match(
        r"mysql\+pymysql://(?P<user>[^:]+):(?P<password>[^@]+)@(?P<host>[^:/]+):(?P<port>\d+)",
        url,
    )
    if match is None:
        raise SystemExit(f"无法解析 DATABASE_URL: {url}")
    conn_params = {
        "host": match["host"],
        "port": int(match["port"]),
        "user": match["user"],
        "password": match["password"],
        "charset": "utf8mb4",
    }
    if os.getenv("MYSQL_PASSWORD"):
        conn_params["password"] = os.environ["MYSQL_PASSWORD"]

    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql"),
              encoding="utf-8") as f:
        sql = f.read()

    # 去掉注释行后再按分号切分，避免注释干扰语句执行
    lines = [line for line in sql.splitlines() if not line.strip().startswith("--")]
    statements = [s.strip() for s in "\n".join(lines).split(";") if s.strip()]

    conn = pymysql.connect(**conn_params)
    try:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
            conn.commit()

            cur.execute("USE shoe_design_platform")
            cur.execute("SHOW TABLES")
            tables = [r[0] for r in cur.fetchall()]
            print("表创建完成:", tables)

            for table in ("users", "projects"):
                cur.execute(f"DESC {table}")
                print(f"\n[{table}]")
                for field, ftype, nullable in [(r[0], r[1], r[2]) for r in cur.fetchall()]:
                    print(f"  {field:<15} {ftype:<20} nullable={nullable}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
