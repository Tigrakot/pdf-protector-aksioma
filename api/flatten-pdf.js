/**
 * Защита PDF — растеризация (текст → картинка, нельзя скопировать)
 * POST /api/flatten-pdf
 * multipart/form-data: file, password?, watermark?, dpi?
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
    const { file, password, watermark, dpi } = req.body || {};

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const finalPassword = password || process.env.PDF_PASSWORD || 'axioma2026';
    const finalWatermark = watermark || process.env.PDF_WATERMARK || 'АКСИОМА — Конфиденциально';
    const finalDpi = parseInt(dpi) || 150;

    console.log(`[FLATTEN] file=${file.filename} (${file.size} bytes) dpi=${finalDpi} password=${finalPassword}`);

    const inputPath = join(tmpdir(), `in-${Date.now()}.pdf`);
    const outputPath = join(tmpdir(), `flat-${Date.now()}.pdf`);

    await writeFile(inputPath, file.buffer);

    const scriptPath = join(process.cwd(), 'api', 'flatten_pdf.py');
    try {
      await execAsync(
        `python3 ${scriptPath} ${inputPath} ${outputPath} "${finalWatermark}" "${finalPassword}" ${finalDpi}`,
        { maxBuffer: 50 * 1024 * 1024 }
      );
    } catch (execErr) {
      throw new Error(`PDF flatten failed: ${execErr.message}`);
    }

    const protectedBuffer = await readFile(outputPath);

    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}

    const filename = (file.filename || 'document.pdf').replace(/\.pdf$/i, '_PLOSKIY.pdf');
    const pdfBase64 = protectedBuffer.toString('base64');

    console.log(`[FLATTEN] done: ${protectedBuffer.length} bytes`);

    res.status(200).json({
      success: true,
      filename,
      password: finalPassword,
      size: protectedBuffer.length,
      pdf: pdfBase64,
      note: 'PDF растеризован: текст нельзя скопировать или выделить',
    });
  } catch (error) {
    console.error('[FLATTEN ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}
