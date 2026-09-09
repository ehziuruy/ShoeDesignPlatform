import re
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

KEYWORD = "leather"
COUNT = 5

PEXELS_SEARCH_URL = "https://www.pexels.com/search/{keyword}/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})


def fetch_page(url: str):
    """请求页面，异常时返回 None。"""
    try:
        return session.get(url, timeout=20)
    except requests.RequestException as exc:
        print(f"[!] 请求失败 {url}: {exc}")
        return None


def extract_from_pexels(keyword: str) -> list[dict]:
    """解析 Pexels 搜索页 HTML 中的图片链接。"""
    url = PEXELS_SEARCH_URL.format(keyword=keyword)
    resp = fetch_page(url)
    if resp is None or resp.status_code != 200 or "Just a moment" in resp.text:
        print("[!] Pexels 访问失败或被 WAF 拦截")
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
        name = (img.get("alt") or "").strip() or f"texture-{len(results) + 1}"
        results.append({"name": name, "url": src})

    return results


def safe_filename(name: str, index: int, url: str) -> str:
    """由标题和 URL 生成安全文件名。"""
    ext = Path(urlparse(url).path).suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    slug = re.sub(r"[^\w-]+", "-", name).strip("-")[:40]
    return f"{index:02d}-{slug or 'texture'}{ext}"


def download_images(candidates: list[dict], count: int) -> list[dict]:
    """逐个下载候选图片，凑满 count 张为止。"""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    downloaded: list[dict] = []

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
            print(f"    [-] 跳过（状态 {resp.status_code}）{url[:60]}...")
            continue

        filename = safe_filename(item["name"], len(downloaded) + 1, url)
        path = DOWNLOAD_DIR / filename
        path.write_bytes(resp.content)
        downloaded.append({
            "name": item["name"],
            "url": url,
            "local_path": f"downloads/{filename}",
        })
        print(f"    [+] {filename}（{len(resp.content) // 1024} KB）")

    return downloaded


def main():
    print(f"=== 纹理爬虫：关键词「{KEYWORD}」，目标 {COUNT} 张 ===")
    candidates = extract_from_pexels(KEYWORD)
    if not candidates:
        print("[x] 未解析到图片，退出")
        return

    downloaded = download_images(candidates, COUNT)
    if not downloaded:
        print("[x] 所有图片下载失败，退出")
        return

    print(f"\n=== 完成：成功下载 {len(downloaded)} 张 ===")
    print(f"图片目录：{DOWNLOAD_DIR}")


if __name__ == "__main__":
    main()