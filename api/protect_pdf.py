"""
Защита PDF: водяной знак + шифрование AES-256
Использует reportlab (водяной знак с Arial для кириллицы) и qpdf (шифрование)
"""

import sys
import os
import subprocess
import tempfile
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# Регистрируем Arial с поддержкой кириллицы
FONT_PATH = os.path.join(os.path.dirname(__file__), 'Arial.ttf')
pdfmetrics.registerFont(TTFont('Arial', FONT_PATH))
pdfmetrics.registerFont(TTFont('Arial-Bold', FONT_PATH))  # обычный жирный = основной файл


def add_watermark(input_pdf, output_pdf, watermark_text="АКСИОМА — Конфиденциально"):
    """Добавляет диагональный водяной знак на каждую страницу"""

    # Создаём водяной знак в памяти (одна страница A4)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)

    # Полупрозрачный серый — достаточно заметный, но не мешает чтению
    c.setFillColor(Color(0.35, 0.35, 0.35, alpha=0.28))

    # Несколько диагональных надписей по всей странице
    c.saveState()
    c.translate(A4[0] / 2, A4[1] / 2)
    c.rotate(45)
    c.setFont("Arial", 36)

    # Шаг ~130pt, чтобы покрыть страницу плотно
    for y_offset in range(-400, 500, 110):
        c.drawCentredString(0, y_offset, watermark_text)

    c.restoreState()
    c.save()
    buffer.seek(0)

    # Накладываем водяной знак на каждую страницу
    wm_reader = PdfReader(buffer)
    wm_page = wm_reader.pages[0]

    reader = PdfReader(input_pdf)
    writer = PdfWriter()

    for page in reader.pages:
        page.merge_page(wm_page)
        writer.add_page(page)

    with open(output_pdf, 'wb') as f:
        writer.write(f)


def encrypt_pdf(input_pdf, output_pdf, user_password, owner_password=None):
    """Шифрует PDF AES-256 + запрещает copy/print/modify"""
    if owner_password is None:
        owner_password = user_password

    subprocess.run([
        'qpdf',
        '--encrypt', user_password, owner_password, '256',
        '--print=low',         # Только низкое разрешение для печати
        '--modify=none',        # Запрет изменений
        '--extract=n',          # Запрет копирования текста
        '--',
        input_pdf,
        output_pdf
    ], check=True)


def protect_pdf(input_pdf, output_pdf, password="axioma2026", watermark_text="АКСИОМА — Конфиденциально"):
    """
    Полная защита PDF: водяной знак + шифрование
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_wm = os.path.join(tmpdir, 'with_watermark.pdf')

        # 1. Добавляем водяной знак
        add_watermark(input_pdf, tmp_wm, watermark_text)

        # 2. Шифруем
        encrypt_pdf(tmp_wm, output_pdf, password, password)

    return output_pdf


if __name__ == '__main__':
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    password = sys.argv[3] if len(sys.argv) > 3 else 'axioma2026'
    watermark = sys.argv[4] if len(sys.argv) > 4 else 'АКСИОМА — Конфиденциально'

    protect_pdf(input_pdf, output_pdf, password, watermark)
    print(f"Protected: {output_pdf}")
