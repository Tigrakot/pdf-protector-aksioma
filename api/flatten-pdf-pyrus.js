/**
 * Защита PDF (растеризация) для Pyrus-бота
 * POST /api/flatten-pdf-pyrus
 * multipart/form-data: file, password?, watermark?, dpi?
 *
 * Возвращает: бинарный PDF (для прямой загрузки в Pyrus через multipart)
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

    console.log(`[FLATTEN-PYRUS] file=${file.filename} (${file.size} bytes)`);

    const inputPath = join(tmpdir(), `in-${Date.now()}.pdf`);
    const outputPath = join(tmpdir(), `flat-${Date.now()}.pdf`);

    await writeFile(inputPath, file.buffer);

    const scriptPath = join(process.cwd(), 'api', 'flatten_pdf.py');
    await execAsync(
      `python3 ${scriptPath} ${inputPath} ${outputPath} "${finalWatermark}" "${finalPassword}" ${finalDpi}`,
      { maxBuffer: 50 * 1024 * 1024 }
    );

    const protectedBuffer = await readFile(outputPath);

    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}

    // Транслитерация для ASCII-safe filename
    const originalName = (file.filename || 'document.pdf').replace(/\.pdf$/i, '');
    const filename = `${originalName}_PLOSKIY.pdf`
      .replace(/[А-Яа-яЁё]/g, c => {
        const map = { 'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
                     'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
        return map[c] || c;
      });

    // Бинарный ответ с правильным Content-Disposition
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-PDF-Password', finalPassword);
    res.setHeader('Content-Length', protectedBuffer.length);
    res.send(protectedBuffer);

    console.log(`[FLATTEN-PYRUS] done: ${protectedBuffer.length} bytes, filename=${filename}`);
  } catch (error) {
    console.error('[FLATTEN-PYRUS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}
