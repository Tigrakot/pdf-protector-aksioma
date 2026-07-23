"""
Сборка PNG (fullPage screenshot) в многостраничный PDF
Каждая страница A4 содержит часть изображения
"""

import sys
import os
import io
import pymupdf
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4


def png_to_multipage_pdf(png_path, output_pdf, page_size=A4):
    """
    Разрезает длинный PNG на страницы A4 и собирает в PDF.
    Сохраняет пропорции.
    """
    img = Image.open(png_path)
    img_w, img_h = img.size
    print(f"[PNG→PDF] source: {img_w}x{img_h}", file=sys.stderr)

    # Масштабируем под ширину A4 (сохраняя пропорции)
    target_w = page_size[0]  # 595pt для A4
    scale = target_w / img_w
    target_h_per_page = page_size[1]  # 842pt для A4

    # Сколько пикселей по высоте помещается на одну страницу
    px_per_page = int(target_h_per_page / scale)
    print(f"[PNG→PDF] scale: {scale:.3f}, px per page: {px_per_page}", file=sys.stderr)

    c = canvas.Canvas(output_pdf, pagesize=page_size)

    y = 0
    page_num = 0
    while y < img_h:
        # Вырезаем кусок изображения
        crop_bottom = min(y + px_per_page, img_h)
        chunk = img.crop((0, y, img_w, crop_bottom))

        # Конвертируем в JPEG bytes
        buf = io.BytesIO()
        chunk.save(buf, 'JPEG', quality=85)
        buf.seek(0)

        # Размер в пунктах
        chunk_h_pt = (crop_bottom - y) * scale

        # Рисуем на странице
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
        print("Usage: png_to_pdf.py <input.png> <output.pdf>")
        sys.exit(1)
    png_to_multipage_pdf(sys.argv[1], sys.argv[2])
    print(f"PDF: {sys.argv[2]} ({os.path.getsize(sys.argv[2])} bytes)")
