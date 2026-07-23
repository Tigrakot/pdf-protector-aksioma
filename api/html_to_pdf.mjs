/**
 * Конвертация HTML-просмотрщика → PDF
 * Использует headless Chromium (Playwright) + Python (pymupdf)
 *
 * 1. Playwright рендерит HTML в fullPage PNG (включая тёмный фон и watermark)
 * 2. pymupdf конвертирует PNG в PDF
 */

import { chromium } from 'playwright';
import { readFile, writeFile, unlink, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function htmlToPdf(htmlContent, outputPath) {
  let browser;
  let tempHtmlPath = null;
  let tempPngPath = null;

  try {
    // 1. Сохраняем HTML во временный файл
    tempHtmlPath = join(tmpdir(), `html2pdf-${Date.now()}.html`);
    await writeFile(tempHtmlPath, htmlContent, 'utf-8');

    // 2. Запускаем Chromium
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // 3. Ждём пока все PDF страницы отрендерятся
    console.log('[HTML→PDF] waiting for PDF pages to render...');
    await page.waitForFunction(
      () => {
        const countEl = document.getElementById('page-count');
        if (!countEl || countEl.textContent === '?') return false;
        const totalPages = parseInt(countEl.textContent);
        const rendered = document.querySelectorAll('#pdf-container canvas').length;
        return totalPages > 0 && rendered >= totalPages;
      },
      { timeout: 120000, polling: 1000 }
    ).catch(() => console.warn('[HTML→PDF] timeout — proceeding with current state'));

    await page.waitForTimeout(500);
    console.log('[HTML→PDF] all pages rendered, taking full-page screenshot');

    // 4. Скриншот всей страницы
    const pngBuffer = await page.screenshot({ fullPage: true, type: 'png' });
    console.log(`[HTML→PDF] screenshot: ${(pngBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    tempPngPath = join(tmpdir(), `html2pdf-${Date.now()}.png`);
    await writeFile(tempPngPath, pngBuffer);

    await browser.close();
    if (tempHtmlPath) await unlink(tempHtmlPath).catch(() => {});

    // 5. Конвертируем PNG → многостраничный PDF через Python
    console.log('[HTML→PDF] converting PNG to multi-page PDF...');
    const scriptPath = join(process.cwd(), 'api', 'png_to_pdf.py');
    await execAsync(`python3 ${scriptPath} ${tempPngPath} ${outputPath}`);

    if (tempPngPath) await unlink(tempPngPath).catch(() => {});

    const statResult = await stat(outputPath);
    console.log(`[HTML→PDF] PDF created: ${outputPath} (${(statResult.size / 1024 / 1024).toFixed(2)} MB)`);
    return outputPath;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    if (tempHtmlPath) await unlink(tempHtmlPath).catch(() => {});
    if (tempPngPath) await unlink(tempPngPath).catch(() => {});
    throw err;
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3] || inputFile.replace(/\.html$/i, '.pdf');

  const html = await readFile(inputFile, 'utf-8');
  await htmlToPdf(html, outputFile);
  console.log(`Converted: ${outputFile}`);
}
