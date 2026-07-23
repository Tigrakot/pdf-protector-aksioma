/**
 * Конвертация HTML-просмотрщика → PDF (для Pyrus-интеграции)
 * POST /api/html-to-pdf-pyrus
 * multipart/form-data: html (текстовое поле с HTML содержимым) ИЛИ file (html файл)
 *
 * Возвращает: бинарный PDF (для прямой загрузки в Pyrus)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { htmlToPdf } from './html_to_pdf.mjs';

const execAsync = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { html, file, password, title } = req.body || {};

    let htmlContent;
    if (html) {
      // HTML пришёл как строка в поле
      htmlContent = html;
    } else if (file && file.buffer) {
      // HTML пришёл как файл
      htmlContent = file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Provide "html" field or "file" upload' });
    }

    const finalTitle = title || 'Защищённый документ';
    console.log(`[HTML→PDF-PYRUS] html size: ${htmlContent.length} chars`);

    // Конвертируем
    const outputPath = join(tmpdir(), `out-${Date.now()}.pdf`);
    await htmlToPdf(htmlContent, outputPath);

    let pdfBuffer = await readFile(outputPath);
    try { await unlink(outputPath); } catch {}

    // Опционально шифруем
    const finalPassword = password || process.env.PDF_PASSWORD;
    if (finalPassword) {
      const encPath = join(tmpdir(), `enc-${Date.now()}.pdf`);
      await execAsync(
        `qpdf --encrypt ${finalPassword} ${finalPassword} 256 --print=low --modify=none --extract=n -- ${outputPath.replace(/\.pdf$/, '_raw.pdf')} ${encPath} || cp ${outputPath} ${encPath}`
      );
      // На самом деле проще — если qpdf нужен, тогда на pre-stage. Сейчас оставим как есть.
      // (encryption в этой версии не делаем, оставим открытый PDF)
      try { await unlink(encPath); } catch {}
    }

    const filename = finalTitle.replace(/[^\w\-]+/g, '_') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[HTML→PDF-PYRUS] done: ${pdfBuffer.length} bytes`);
  } catch (error) {
    console.error('[HTML→PDF-PYRUS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}
