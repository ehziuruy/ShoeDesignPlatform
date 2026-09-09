"""AI 配色生成模块：基于色彩理论的本地生成器。

随机采用四种经典配色方案之一（单色系 / 邻近色 / 互补色 / 三角配色），
在 HSL 色彩空间中生成 5 组配色，并按明度/饱和度/色相自动命名。
"""

import colorsys
import random

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/ai", tags=["AI 配色 Colors"])


class ColorScheme(BaseModel):
    name: str
    hex: str


# 色相环边界（度）-> 中文色相名
HUE_NAMES: list[tuple[float, str]] = [
    (15, "红"), (40, "橙"), (68, "黄"), (95, "黄绿"), (150, "绿"),
    (185, "青"), (215, "蓝"), (255, "紫蓝"), (290, "紫"), (330, "洋红"), (361, "红"),
]

SCHEME_NAMES = ("单色系", "邻近色", "互补色", "三角配色")


def _hue_name(h: float) -> str:
    degree = (h % 1) * 360
    return next(name for bound, name in HUE_NAMES if degree <= bound)


def _color_name(h: float, s: float, l: float) -> str:
    """按 HSL 生成中文名：明度前缀 + 饱和度前缀 + 色相名。"""
    prefixes: list[str] = []
    if l <= 0.3:
        prefixes.append("深")
    elif l <= 0.45:
        prefixes.append("暗")
    elif l >= 0.82:
        prefixes.append("浅")
    elif l >= 0.68:
        prefixes.append("柔")
    if s <= 0.18:
        prefixes.append("灰调")
    elif s >= 0.82:
        prefixes.append("荧光")
    return "".join(prefixes) + _hue_name(h)


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h % 1, min(max(l, 0.05), 0.95), min(max(s, 0.0), 1.0))
    return "#{:02X}{:02X}{:02X}".format(round(r * 255), round(g * 255), round(b * 255))


def _generate_scheme_colors() -> list[tuple[float, float, float]]:
    """随机选一种配色方案，返回 5 组 HSL 值。"""
    base = random.random()
    scheme = random.choice(SCHEME_NAMES)

    if scheme == "单色系":
        # 同一色相，梯度明度：深 -> 浅
        return [(base, 0.65, l) for l in (0.24, 0.38, 0.52, 0.68, 0.84)]

    if scheme == "邻近色":
        # 色相环上相邻的 5 个色相，过渡自然
        offsets = [(-0.09, 0.6, 0.42), (-0.045, 0.65, 0.55), (0.0, 0.7, 0.5),
                   (0.045, 0.6, 0.6), (0.09, 0.55, 0.72)]
        return [((base + dh) % 1, s, l) for dh, s, l in offsets]

    if scheme == "互补色":
        # 主色三阶 + 互补色两阶，对比鲜明
        return [
            (base, 0.7, 0.3),
            (base, 0.6, 0.5),
            (base, 0.5, 0.72),
            ((base + 0.5) % 1, 0.65, 0.45),
            ((base + 0.5) % 1, 0.45, 0.75),
        ]

    # 三角配色：色相环三等分 + 过渡色
    return [
        (base, 0.7, 0.45),
        ((base + 1 / 3) % 1, 0.65, 0.4),
        ((base + 2 / 3) % 1, 0.6, 0.5),
        (base, 0.4, 0.75),
        ((base + 0.5) % 1, 0.3, 0.85),
    ]


@router.get("/generate-colors", response_model=list[ColorScheme])
def generate_colors():
    """基于色彩理论生成 5 组配色（单色系 / 邻近色 / 互补色 / 三角配色随机其一）。"""
    hsl_list = _generate_scheme_colors()
    seen: set[str] = set()
    result: list[ColorScheme] = []
    for h, s, l in hsl_list:
        name = _color_name(h, s, l)
        while name in seen:
            # 极端情况下保证名称唯一
            name += "'"
        seen.add(name)
        result.append(ColorScheme(name=name, hex=_hsl_to_hex(h, s, l)))
    return result
