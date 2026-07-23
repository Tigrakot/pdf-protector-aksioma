"""
Сборка PNG (fullPage screenshot) в многостраничный PDF
Каждая страница A4 содержит часть изображения + шум против OCR
"""

import sys
import os
import io
import random
import pymupdf
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4


def add_ocr_noise(img, font_path=None):
    """
    Накладывает полупрозрачный шум поверх текста, чтобы OCR не справлялся.
    Генерирует случайные символы + диагональные полосы.
    """
    draw = ImageDraw.Draw(img, 'RGBA')
    w, h = img.size

    # 1. Диагональные полосы-мусор
    for _ in range(40):
        x1 = random.randint(0, w)
        y1 = random.randint(0, h)
        length = random.randint(50, 200)
        angle = random.choice([30, 45, 60, 120, 135, 150])
        # Симулируем линию под углом через несколько точек
        for t in range(0, length, 3):
            dx = int(t * 0.5)
            dy = int(t * 0.866) if angle in [30, 60] else int(t * 0.707)
            px = x1 + (dx if angle < 90 else -dx)
            py = y1 + (dy if angle < 90 else -dy)
            if 0 <= px < w and 0 <= py < h:
                draw.point((px, py), fill=(150, 150, 150, 40))

    # 2. Случайные символы (мусор)
    chars = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя0123456789'
    try:
        font = ImageFont.truetype(font_path, 24) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    for _ in range(200):
        x = random.randint(0, w - 30)
        y = random.randint(0, h - 30)
        ch = random.choice(chars)
        draw.text((x, y), ch, fill=(80, 80, 80, 35), font=font)

    # 3. Тонкие диагональные полосы (через всю страницу)
    for offset in range(-h, w + h, 60):
        draw.line([(offset, 0), (offset + h, h)], fill=(200, 200, 200, 25), width=1)

    return img


def png_to_multipage_pdf(png_path, output_pdf, page_size=A4, font_path=None, anti_ocr=True):
    """
    Разрезает длинный PNG на страницы A4 и собирает в PDF.
    Опционально добавляет шум против OCR.
    """
    img = Image.open(png_path)
    img_w, img_h = img.size
    print(f"[PNG→PDF] source: {img_w}x{img_h}, anti-ocr: {anti_ocr}", file=sys.stderr)

    target_w = page_size[0]
    scale = target_w / img_w
    px_per_page = int(page_size[1] / scale)
    print(f"[PNG→PDF] scale: {scale:.3f}, px per page: {px_per_page}", file=sys.stderr)

    c = canvas.Canvas(output_pdf, pagesize=page_size)

    y = 0
    page_num = 0
    while y < img_h:
        crop_bottom = min(y + px_per_page, img_h)
        chunk = img.crop((0, y, img_w, crop_bottom))

        if anti_ocr:
            chunk = add_ocr_noise(chunk, font_path=font_path)

        buf = io.BytesIO()
        chunk.save(buf, 'JPEG', quality=82)
        buf.seek(0)

        chunk_h_pt = (crop_bottom - y) * scale
        c.drawImage(
            ImageReader(buf),
            0, 0,
            width=target_w,
            height=chunk_h_pt,
            preserveAspectRatio=True,
        )
        c.showPage()
        page_num += 1
        y = crop_bottom

    c.save()
    print(f"[PNG→PDF] {page_num} pages written", file=sys.stderr)
    return output_pdf


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: png_to_pdf.py <input.png> <output.pdf> [font.ttf]")
        sys.exit(1)
    font = sys.argv[3] if len(sys.argv) > 3 else None
    png_to_multipage_pdf(sys.argv[1], sys.argv[2], font_path=font)
    print(f"PDF: {sys.argv[2]} ({os.path.getsize(sys.argv[2])} bytes)")

