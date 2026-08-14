#!/usr/bin/env python3
"""PageKit 확장 아이콘 생성기 (16/32/48/128 PNG).

디자인: 파란→청록 그라데이션 둥근 사각형 배경 + 흰색 페이지(모서리 접힘)
+ 텍스트 라인 + 청록 체크 배지. 16px에서도 인식 가능한 단순 형태.
"""
import math
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")
SIZES = [16, 32, 48, 128]

BG_TOP = (59, 130, 246)     # #3B82F6
BG_BOTTOM = (6, 182, 212)   # #06B6D4
PAGE_WHITE = (255, 255, 255)
LINE_GRAY = (148, 163, 184)  # #94A3B8
CHECK_GREEN = (16, 185, 129)  # #10B981
CHECK_WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 둥근 배경 (radius = size * 0.22)
    radius = max(1, int(size * 0.22))
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dbg = ImageDraw.Draw(bg)
    dbg.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(0, 0, 0, 255))

    # 세로 그라데이션 배경
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dbg = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / (size - 1)
        dbg.line([(0, y), (size - 1, y)], fill=lerp(BG_TOP, BG_BOTTOM, t) + (255,))
    mask = Image.new("L", (size, size), 0)
    dm = ImageDraw.Draw(mask)
    dm.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)

    # --- 흰색 페이지 (가운데) ---
    u = size / 128.0  # 단위 스케일
    page_l = int(34 * u)
    page_t = int(20 * u)
    page_r = int(94 * u)
    page_b = int(108 * u)
    fold = int(16 * u)  # 접힌 모서리 크기

    # 페이지 본체 + 접힌 모서리 잘라내기
    page = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dp = ImageDraw.Draw(page)
    dp.rounded_rectangle([page_l, page_t, page_r, page_b], radius=int(6 * u), fill=PAGE_WHITE + (255,))
    # 우상단 접힘 (삼각형 제거 → 접힌 느낌)
    dp.polygon(
        [(page_r - fold, page_t), (page_r, page_t), (page_r, page_t + fold)],
        fill=(0, 0, 0, 0),
    )
    img.paste(page, (0, 0), page)

    # 접힌 모서리 그림자 삼각형
    d = ImageDraw.Draw(img)
    fold_pts = [
        (page_r - fold, page_t),
        (page_r, page_t),
        (page_r, page_t + fold),
    ]
    d.polygon(fold_pts, fill=(203, 213, 225, 255))  # slate-300
    # 접힌 라인
    d.line([(page_r - fold, page_t), (page_r, page_t + fold)], fill=(148, 163, 184, 255), width=max(1, int(1.5 * u)))

    # --- 텍스트 라인 3개 ---
    lw = max(1, int(4 * u))
    for i, (lx, lr) in enumerate([(0.14, 0.72), (0.14, 0.52), (0.14, 0.60)]):
        y = int((42 + i * 14) * u)
        x1 = int(page_l + lx * (page_r - page_l))
        x2 = int(page_l + lr * (page_r - page_l))
        d.line([(x1, y), (x2, y)], fill=LINE_GRAY + (255,), width=lw)

    # --- 체크 배지 (우하단) ---
    bc = int(88 * u)  # 배지 중심
    br = int(16 * u)  # 배지 반지름
    d.ellipse([bc - br, bc - br, bc + br, bc + br], fill=CHECK_GREEN + (255,))
    # 체크 표시 (라인 두께는 배지 크기에 비례)
    cw = max(2, int(5 * u))
    cx = bc
    cy = bc
    d.line([(cx - 7 * u, cy), (cx - 2 * u, cy + 6 * u)], fill=CHECK_WHITE + (255,), width=cw)
    d.line([(cx - 2 * u, cy + 6 * u), (cx + 8 * u, cy - 6 * u)], fill=CHECK_WHITE + (255,), width=cw)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        icon = make_icon(s)
        path = os.path.join(OUT_DIR, f"icon{s}.png")
        icon.save(path, "PNG")
        print(f"생성: {path} ({s}x{s})")


if __name__ == "__main__":
    main()