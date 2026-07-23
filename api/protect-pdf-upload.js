/**
 * Защита PDF — загрузка через web-форму
 * POST /api/protect-pdf-upload
 * multipart/form-data: file, password?, watermark?
 *
 * Возвращает: зашифрованный PDF (binary)
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
    // Используем multer-like парсинг через raw body
    // Или ожидаем что body уже распарсен (нужен middleware)
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

    // Возвращаем как download
    const filename = (file.filename || 'document.pdf').replace(/\.pdf$/i, '_ZASHCHISHENO.pdf');
    const filenameAscii = filename
      .replace(/[А-Яа-яЁё]/g, c => {
        const map = { 'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
                     'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
        return map[c] || c;
      });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-PDF-Password', finalPassword);
    res.send(protectedBuffer);

    console.log(`[UPLOAD] done: ${protectedBuffer.length} bytes`);
  } catch (error) {
    console.error('[UPLOAD ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}
