"""
Защита PDF через растеризацию:
1. Каждая страница → JPEG (текст становится картинкой, копировать нельзя)
2. Водяной знак накладывается в Pillow (тоже картинкой)
3. Собираем обратно в PDF
4. Шифруем AES-256
"""

import sys
import os
import subprocess
import tempfile
import io
from pypdf import PdfReader, PdfWriter
import pymupdf
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont


def flatten_pdf(input_pdf, output_pdf, watermark_text=None, password=None, dpi=150):
    """
    Растеризует каждую страницу PDF в JPEG и собирает обратно.
    Текст становится частью изображения — нельзя выделить/скопировать.
    Водяной знак тоже накладывается как часть картинки (Pillow).
    """

    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Растеризуем через pymupdf
        src = pymupdf.open(input_pdf)
        images = []

        for page_num, page in enumerate(src):
            mat = pymupdf.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("jpeg", jpg_quality=85)
            images.append((pix.width, pix.height, img_bytes))
            print(f"[FLATTEN] page {page_num + 1}/{src.page_count} → {pix.width}x{pix.height}", file=sys.stderr)

        src.close()

        # 2. Накладываем водяной знак через Pillow (тоже растровый)
        if watermark_text:
            font_path = os.path.join(os.path.dirname(__file__), 'Arial.ttf')
            processed = []
            for width, height, img_bytes in images:
                img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
                draw = ImageDraw.Draw(img)
                # Размер шрифта ~2.5% от ширины
                font_size = max(18, int(width * 0.025))
                try:
                    font = ImageFont.truetype(font_path, font_size)
                except Exception:
                    font = ImageFont.load_default()

                # Горизонтальные строки каждые ~7% высоты
                step = int(height * 0.07)
                y = int(height * 0.05)
                while y < int(height * 0.95):
                    # Полупрозрачный серый
                    draw.text((width / 2, y), watermark_text, fill=(140, 140, 140), font=font, anchor="mm")
                    y += step

                out_buf = io.BytesIO()
                img.save(out_buf, 'JPEG', quality=88)
                processed.append((width, height, out_buf.getvalue()))
            images = processed

        # 3. Собираем обратно в PDF через reportlab
        flat_path = os.path.join(tmpdir, 'flat.pdf')
        c = canvas.Canvas(flat_path)

        for width, height, img_bytes in images:
            w_pt = width * 72 / dpi
            h_pt = height * 72 / dpi
            img = ImageReader(io.BytesIO(img_bytes))
            c.setPageSize((w_pt, h_pt))
            c.drawImage(img, 0, 0, width=w_pt, height=h_pt, preserveAspectRatio=True)
            c.showPage()

        c.save()

        # 4. Шифруем (если есть пароль)
        if password:
            enc_path = os.path.join(tmpdir, 'encrypted.pdf')
            encrypt_pdf(flat_path, enc_path, password)
            final = enc_path
        else:
            final = flat_path

        import shutil
        shutil.copy2(final, output_pdf)

    return output_pdf


def encrypt_pdf(input_pdf, output_pdf, user_password, owner_password=None):
    """Шифрует PDF AES-256"""
    if owner_password is None:
        owner_password = user_password

    subprocess.run([
        'qpdf',
        '--encrypt', user_password, owner_password, '256',
        '--print=low',
        '--modify=none',
        '--extract=n',
        '--',
        input_pdf,
        output_pdf
    ], check=True)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: flatten_pdf.py <input.pdf> <output.pdf> [watermark] [password] [dpi]")
        sys.exit(1)

    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    watermark = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    password = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
    dpi = int(sys.argv[5]) if len(sys.argv) > 5 else 150

    flatten_pdf(input_pdf, output_pdf, watermark, password, dpi)
    print(f"Flattened: {output_pdf} ({os.path.getsize(output_pdf)} bytes)")
