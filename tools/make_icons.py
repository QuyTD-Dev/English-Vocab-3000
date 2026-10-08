# -*- coding: utf-8 -*-
"""Vẽ biểu tượng app (PWA) vào thư mục icons/.

Cần: pip install pillow
Chạy: python tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"

TOP = (37, 99, 235)  # #2563eb – màu chủ đạo của giao diện
BOTTOM = (34, 197, 94)  # #22c55e – màu "đã thuộc"


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img


def font(path, px):
    try:
        return ImageFont.truetype(path, px)
    except OSError:
        return ImageFont.load_default()


def draw_icon(size, maskable=False, rounded=True):
    """maskable: chừa vùng an toàn 80% ở giữa (Android có thể cắt hình tròn)."""
    scale = 4  # vẽ to rồi thu nhỏ cho mịn
    S = size * scale
    bg = gradient(S)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable or not rounded:
        md.rectangle([0, 0, S, S], fill=255)
    else:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    safe = 0.62 if maskable else 0.78  # tỉ lệ vùng chứa chữ
    box = S * safe
    cx = S / 2

    # Chữ "Aa"
    f_big = font(FONT_BOLD, int(box * 0.62))
    text = "Aa"
    w = d.textlength(text, font=f_big)
    top = S / 2 - box * 0.52
    d.text((cx - w / 2, top), text, font=f_big, fill=(255, 255, 255))

    # Thanh trắng mờ + "3000"
    f_small = font(FONT_BOLD, int(box * 0.24))
    label = "3000"
    lw = d.textlength(label, font=f_small)
    ly = S / 2 + box * 0.2
    pad_x, pad_y = box * 0.07, box * 0.025
    d.rounded_rectangle(
        [cx - lw / 2 - pad_x, ly - pad_y, cx + lw / 2 + pad_x, ly + box * 0.3 + pad_y],
        radius=int(box * 0.08),
        fill=(255, 255, 255, 235),
    )
    d.text((cx - lw / 2, ly - box * 0.005), label, font=f_small, fill=TOP)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    outputs = {
        "icon-192.png": draw_icon(192),
        "icon-512.png": draw_icon(512),
        "maskable-512.png": draw_icon(512, maskable=True),
        "apple-touch-icon.png": draw_icon(180, rounded=False),  # iOS tự bo góc
        "favicon-32.png": draw_icon(32),
    }
    for name, img in outputs.items():
        path = os.path.join(OUT, name)
        img.save(path, optimize=True)
        print(name, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
