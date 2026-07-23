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
    Защита от OCR без искажения читаемого текста:
    - Мелкий мусор ТОЛЬКО в межстрочных промежутках (не на самих строках)
    - Диагональные полосы (лёгкие, фоновые)
    - Лёгкий зерно-шум
    - JPEG quality 70 при сохранении (вместо 82)
    Строки текста НЕ сдвигаются, НЕ искажаются — человек читает без проблем.
    """
    import numpy as np
    draw = ImageDraw.Draw(img, 'RGBA')
    w, h = img.size

    try:
        font_tiny = ImageFont.truetype(font_path, 7) if font_path else ImageFont.load_default()
    except Exception:
        font_tiny = ImageFont.load_default()

    # 1. Диагональные полосы — лёгкие, фон
    for offset in range(-h, w + h, 40):
        draw.line([(offset, 0), (offset + h, h)], fill=(210, 210, 210, 35), width=1)

    # 2. Мусор в межстрочных промежутках (белые полоски ~7px высотой каждые ~20px)
    #    Имитируем зазоры между строками текста
    garbage = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя0123456789'
    for y in range(0, h, 18):  # каждые 18 пикселей — межстрочный зазор
        # Сдвиг в межстрочье (между буквами одной строки и следующей)
        gap_y = y + 14  # примерно в межстрочном зазоре
        if gap_y >= h:
            continue
        for _ in range(4):  # 4 мусорных символа в каждом зазоре
            x = random.randint(0, max(0, w - 20))
            ch = random.choice(garbage)
            # Полупрозрачный серый — едва видно глазом, но OCR путается
            draw.text((x, gap_y), ch, fill=(140, 140, 140, 45), font=font_tiny)

    # 3. Лёгкое зерно (не портит читаемость)
    arr = np.array(img).astype(np.int16)
    noise = np.random.randint(-8, 8, arr.shape, dtype=np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

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
        # Quality 70 — артефакты компрессии помогают против LLM-Vision OCR
        chunk.save(buf, 'JPEG', quality=70)
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

