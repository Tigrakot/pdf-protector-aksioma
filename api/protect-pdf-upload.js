/**
 * Защита PDF — загрузка через web-форму
 * POST /api/protect-pdf-upload
 * multipart/form-data: file, password?, watermark?
 *
 * Возвращает: JSON { success, filename, password, size, pdf (base64) }
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file, password, watermark } = req.body || {};

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const finalPassword = password || process.env.PDF_PASSWORD || 'axioma2026';
    const finalWatermark = watermark || process.env.PDF_WATERMARK || 'АКСИОМА — Конфиденциально';

    console.log(`[UPLOAD] file=${file.filename} (${file.size} bytes) password=${finalPassword}`);

    // Сохраняем во временный файл
    const inputPath = join(tmpdir(), `in-${Date.now()}.pdf`);
    const outputPath = join(tmpdir(), `out-${Date.now()}.pdf`);
    await writeFile(inputPath, file.buffer);

    // Защищаем
    const scriptPath = join(process.cwd(), 'api', 'protect_pdf.py');
    try {
      await execAsync(
        `python3 ${scriptPath} ${inputPath} ${outputPath} ${finalPassword} "${finalWatermark}"`
      );
    } catch (execErr) {
      throw new Error(`PDF protection failed: ${execErr.message}`);
    }

    // Читаем защищённый PDF
    const protectedBuffer = await readFile(outputPath);

    // Cleanup
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}

    // Возвращаем как base64 в JSON (надёжно работает через proxy)
    const filename = (file.filename || 'document.pdf').replace(/\.pdf$/i, '_ZASHCHISHENO.pdf');
    const pdfBase64 = protectedBuffer.toString('base64');

    console.log(`[UPLOAD] done: ${protectedBuffer.length} bytes`);

    res.status(200).json({
      success: true,
      filename,
      password: finalPassword,
      size: protectedBuffer.length,
      pdf: pdfBase64,
    });
  } catch (error) {
    console.error('[UPLOAD ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}
