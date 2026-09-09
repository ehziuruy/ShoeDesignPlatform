"""
皮革纹理爬虫
============
独立工具：从免费图源抓取皮革纹理图片，供鞋款设计平台用作材质贴图。

抓取策略（自动降级）：
  1. 主通道 —— requests + BeautifulSoup 解析 Pexels 搜索页
     https://www.pexels.com/search/leather/，提取 images.pexels.com 图片直链
  2. 备用通道 —— 若主通道被 Cloudflare 等 WAF 拦截（返回 403 挑战页，
     requests 无法执行 JS），自动改用必应图片搜索「leather texture」，
     从结果元数据中提取图片直链（仍以免费纹理站点为主）

产物：
  - spider/downloads/     下载的纹理图片
  - spider/textures.json  图片名称与本地路径索引

用法：
    python texture_spider.py                    # 默认抓取 5 张
    python texture_spider.py --count 3          # 自定义数量
    python texture_spider.py --keyword fabric   # 自定义关键词
"""

import argparse
import json
import re
import sys
from datetime import datetime
from html import unescape
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# Windows 控制台默认 GBK，统一切到 UTF-8 避免中文输出乱码
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PEXELS_SEARCH_URL = "https://www.pexels.com/search/{keyword}/"
BING_IMAGE_SEARCH_URL = "https://www.bing.com/images/search?q={query}&form=HDRSC2&first=1"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
OUTPUT_JSON = BASE_DIR / "textures.json"

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})


def fetch_page(url: str) -> requests.Response | None:
    """请求页面，网络异常时返回 None。"""
    try:
        return session.get(url, timeout=20)
    except requests.RequestException as exc:
        print(f"[!] 请求失败 {url}: {exc}")
        return None


# ---------------------------------------------------------------- 主通道

def extract_from_pexels(keyword: str) -> list[dict]:
    """主通道：解析 Pexels 搜索页 HTML 中的图片链接。"""
    print(f"[1/3] 主通道：抓取 Pexels 搜索页 .../search/{keyword}/")
    resp = fetch_page(PEXELS_SEARCH_URL.format(keyword=keyword))
    if resp is None:
        return []
    if resp.status_code != 200 or "Just a moment" in resp.text:
        print(f"[!] Pexels 被 WAF 拦截（HTTP {resp.status_code}），切换备用通道")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    results: list[dict] = []
    seen: set[str] = set()
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "images.pexels.com/photos/" not in src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        if src in seen:
            continue
        seen.add(src)
        name = (img.get("alt") or "").strip() or f"pexels-texture-{len(results) + 1}"
        results.append({"name": name, "url": src, "source": "pexels"})
    print(f"[+] 主通道解析到 {len(results)} 张候选图片")
    return results


# ---------------------------------------------------------------- 备用通道

def extract_from_bing(query: str) -> list[dict]:
    """备用通道：解析必应图片搜索结果元数据（锚点 m 属性中的 murl / t 字段）。"""
    print(f"[2/3] 备用通道：必应图片搜索「{query}」")
    resp = fetch_page(BING_IMAGE_SEARCH_URL.format(query=requests.utils.quote(query)))
    if resp is None or resp.status_code != 200:
        print(f"[!] 必应搜索失败（HTTP {resp.status_code if resp else 'N/A'}）")
        return []

    # 结果锚点形如 <a ... m="{&quot;murl&quot;:&quot;https://...&quot;,...&quot;t&quot;:&quot;标题&quot;...}">
    # 先整体捕获再反转义、JSON 解析，比逐字段正则更稳
    results: list[dict] = []
    seen: set[str] = set()
    for match in re.finditer(r'm="(\{.*?\})"', resp.text):
        try:
            meta = json.loads(unescape(match.group(1)))
        except json.JSONDecodeError:
            continue
        url = meta.get("murl") or ""
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        title = (meta.get("t") or "").strip() or Path(urlparse(url).path).stem
        results.append({"name": title, "url": url, "source": "bing"})
    print(f"[+] 备用通道解析到 {len(results)} 张候选图片")
    return results


# ---------------------------------------------------------------- 下载

def safe_filename(name: str, index: int, url: str) -> str:
    """由标题生成安全文件名：去除非法字符、截断长度、补序号与扩展名。"""
    ext = Path(urlparse(url).path).suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    slug = re.sub(r"[^\w-]+", "-", name).strip("-")[:40]
    return f"{index:02d}-{slug or 'texture'}{ext}"


def download_images(candidates: list[dict], count: int) -> tuple[list[dict], str]:
    """逐个尝试下载候选图片（校验状态码与 Content-Type），凑满 count 张为止。"""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    downloaded: list[dict] = []
    strategy = candidates[0]["source"] if candidates else "none"

    print(f"[3/3] 开始下载（目标 {count} 张，候选 {len(candidates)} 张）...")
    for item in candidates:
        if len(downloaded) >= count:
            break
        url = item["url"]
        try:
            resp = session.get(url, timeout=30)
        except requests.RequestException as exc:
            print(f"    [!] 下载失败 {url[:70]}... : {exc}")
            continue
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code != 200 or not content_type.startswith("image/"):
            print(f"    [-] 跳过（HTTP {resp.status_code}，{content_type[:30]}）{url[:60]}...")
            continue

        filename = safe_filename(item["name"], len(downloaded) + 1, url)
        path = DOWNLOAD_DIR / filename
        path.write_bytes(resp.content)

        downloaded.append(
            {
                "name": item["name"],
                "url": url,
                "local_path": f"downloads/{filename}",
                "size_bytes": len(resp.content),
                "source": item["source"],
            }
        )
        print(f"    [+] {filename}（{len(resp.content) // 1024} KB）")

    return downloaded, strategy


# ---------------------------------------------------------------- 入口

def main() -> None:
    parser = argparse.ArgumentParser(description="免费纹理图片爬虫（Pexels 主通道 + 必应备用通道）")
    parser.add_argument("--keyword", default="leather", help="搜索关键词（默认 leather）")
    parser.add_argument("--count", type=int, default=5, help="下载图片数量（默认 5）")
    args = parser.parse_args()

    print(f"=== 纹理爬虫启动：关键词「{args.keyword}」，数量 {args.count} ===")

    # 主通道 -> 备用通道 自动降级
    candidates = extract_from_pexels(args.keyword)
    if not candidates:
        candidates = extract_from_bing(f"{args.keyword} texture")
    if not candidates:
        print("[x] 两个通道均未解析到图片，退出")
        sys.exit(1)

    downloaded, strategy = download_images(candidates, args.count)
    if not downloaded:
        print("[x] 候选图片全部下载失败，退出")
        sys.exit(1)

    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "keyword": args.keyword,
        "strategy": strategy,
        "count": len(downloaded),
        "textures": downloaded,
    }
    OUTPUT_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n=== 完成：成功下载 {len(downloaded)} 张（抓取策略：{strategy}）===")
    print(f"图片目录：{DOWNLOAD_DIR}")
    print(f"索引文件：{OUTPUT_JSON}")


if __name__ == "__main__":
    main()
