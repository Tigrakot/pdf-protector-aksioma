/**
 * Защита PDF — генерация HTML-просмотрщика
 * POST /api/protect-html
 * multipart/form-data: file, title?, watermark?
 *
 * Возвращает: HTML страницу с встроенным защищённым просмотром PDF
 */

import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file, title, watermark } = req.body || {};
    console.log('[HTML] file=', file ? file.filename : 'undefined', 'size=', file?.size);

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const finalTitle = title || file.filename || 'Защищённый документ';
    const finalWatermark = watermark || 'АКСИОМА — КонфиДЕНЦИАЛЬНО';

    console.log(`[HTML] file=${file.originalname} (${file.size} bytes) title="${finalTitle}"`);

    // Сохраняем PDF
    const inputPath = join(tmpdir(), `in-${Date.now()}.pdf`);
    const outputPath = join(tmpdir(), `wm-${Date.now()}.pdf`);
    await writeFile(inputPath, file.buffer);

    // Добавляем водяной знак через Python
    const scriptPath = join(process.cwd(), 'api', 'protect_pdf.py');
    try {
      // Используем пустой пароль и тот же водяной знак (только watermark, без шифрования)
      // Создадим отдельный Python скрипт для водяного знака
      const watermarkScript = `
import sys
sys.path.insert(0, '${process.cwd()}/api')
from protect_pdf import add_watermark
add_watermark('${inputPath}', '${outputPath}', '${finalWatermark.replace(/'/g, "\\'")}')
`;
      await execAsync(`python3 -c "${watermarkScript.replace(/"/g, '\\"')}"`);
    } catch (err) {
      // Если водяной знак не сработал — продолжаем без него
      console.warn(`[HTML] watermark failed: ${err.message}, continuing without`);
      await writeFile(outputPath, file.buffer);
    }

    // Читаем PDF с водяным знаком
    const pdfBuffer = await readFile(outputPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Cleanup
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}

    // Генерируем защищённый HTML
    const html = generateProtectedHTML(pdfBase64, finalTitle, finalWatermark);

    const filename = (file.filename || 'document').replace(/\.pdf$/i, '_view.html');
    console.log(`[HTML] done: ${html.length} chars`);

    // Возвращаем HTML в JSON (надёжно через proxy)
    res.status(200).json({
      success: true,
      filename,
      size: html.length,
      html,
    });
  } catch (error) {
    console.error('[HTML ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}

function generateProtectedHTML(pdfBase64, title, watermark) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>

<!-- PDF.js (Mozilla) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, sans-serif;
    background: #1a1a1a;
    color: #fff;
    user-select: none;
    -webkit-user-select: none;
  }
  .header {
    background: #0a0a0a;
    color: #fff;
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #333;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header h1 { font-size: 16px; font-weight: 500; }
  .header .badge {
    background: #d32f2f;
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .toolbar {
    background: #2a2a2a;
    padding: 8px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #333;
    position: sticky;
    top: 45px;
    z-index: 99;
  }
  .toolbar button {
    background: #444;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .toolbar button:hover:not(:disabled) { background: #666; }
  .toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar .info {
    color: #aaa;
    padding: 6px 14px;
    font-size: 13px;
    min-width: 80px;
    text-align: center;
  }

  /* Прогресс-бар */
  .progress {
    background: #1a1a1a;
    padding: 30px 20px;
    text-align: center;
  }
  .progress-text {
    color: #aaa;
    font-size: 14px;
    margin-bottom: 12px;
  }
  .progress-bar {
    width: 200px;
    height: 3px;
    background: #333;
    border-radius: 2px;
    margin: 0 auto;
    overflow: hidden;
  }
  .progress-bar::before {
    content: '';
    display: block;
    width: 30%;
    height: 100%;
    background: #5fc7d4;
    animation: progress 1s ease-in-out infinite;
  }
  @keyframes progress {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }

  #pdf-container {
    padding: 20px;
    text-align: center;
    background: #1a1a1a;
    min-height: calc(100vh - 100px);
  }
  #pdf-container canvas {
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    margin-bottom: 16px;
    max-width: 100%;
  }

  /* Водяной знак — горизонтальный */
  .watermark-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  }
  .watermark-overlay .wm-line {
    position: absolute;
    left: 0;
    right: 0;
    color: rgba(180, 180, 180, 0.12);
    font-size: 22px;
    font-weight: 300;
    letter-spacing: 4px;
    text-align: center;
    white-space: nowrap;
    font-family: -apple-system, sans-serif;
  }

  @media print {
    body { display: none !important; }
  }
</style>
</head>
<body oncontextmenu="return false" onselectstart="return false"
      ondragstart="return false" oncopy="return false"
      oncut="return false" onpaste="return false">

<div class="header">
  <h1>📄 ${escapeHtml(title)}</h1>
  <span class="badge">🔒 ЗАЩИЩЕНО</span>
</div>

<div class="toolbar">
  <button id="btn-prev">◀</button>
  <span class="info"><span id="page-num">1</span> / <span id="page-count">?</span></span>
  <button id="btn-next">▶</button>
  <button id="btn-zoom-out">−</button>
  <span class="info" id="zoom-level">100%</span>
  <button id="btn-zoom-in">+</button>
</div>

<div id="pdf-container">
  <div class="progress" id="loading">
    <div class="progress-text">Загружаю документ…</div>
    <div class="progress-bar"></div>
  </div>
</div>

<div class="watermark-overlay" id="watermark">
  ${generateWatermarkLines(watermark)}
</div>

<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const pdfData = atob('${pdfBase64}');
const pdfBytes = new Uint8Array(pdfData.length);
for (let i = 0; i < pdfData.length; i++) {
  pdfBytes[i] = pdfData.charCodeAt(i);
}

let pdfDoc = null;
let currentPage = 1;
let currentZoom = 1.0;
let renderedPages = new Set();
let renderQueue = [];
let isRendering = false;

async function loadPdf() {
  try {
    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    document.getElementById('page-count').textContent = pdfDoc.numPages;

    // Очищаем прогресс, добавляем placeholder'ы для всех страниц
    const container = document.getElementById('pdf-container');
    container.innerHTML = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const ph = document.createElement('div');
      ph.id = 'page-' + i;
      ph.style.minHeight = '600px';
      ph.style.marginBottom = '16px';
      ph.dataset.pageNum = i;
      container.appendChild(ph);
      renderQueue.push(i);
    }

    // Запускаем рендер первой страницы сразу
    renderPage(1);
    // Остальные — в фоне, с задержкой (не блокируем UI)
    setTimeout(processQueue, 100);
  } catch (err) {
    console.error(err);
    document.getElementById('pdf-container').innerHTML = '<div style="padding:40px;color:#f88">Ошибка загрузки PDF</div>';
  }
}

async function processQueue() {
  if (isRendering || renderQueue.length === 0) return;
  isRendering = true;
  const next = renderQueue.shift();
  await renderPage(next, true);
  isRendering = false;
  if (renderQueue.length > 0) {
    setTimeout(processQueue, 50);
  }
}

async function renderPage(num, silent = false) {
  if (renderedPages.has(num)) return;
  const placeholder = document.getElementById('page-' + num);
  if (!placeholder) return;

  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: currentZoom * 1.3 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.userSelect = 'none';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';

    placeholder.innerHTML = '';
    placeholder.appendChild(canvas);

    await page.render({ canvasContext: context, viewport }).promise;
    renderedPages.add(num);
    if (!silent) {
      currentPage = num;
      document.getElementById('page-num').textContent = num;
    }
  } catch (err) {
    console.error('Render error page', num, err);
  }
}

// Кнопки навигации
document.getElementById('btn-prev').onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    scrollToPage(currentPage);
  }
};
document.getElementById('btn-next').onclick = () => {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    currentPage++;
    scrollToPage(currentPage);
  }
};
document.getElementById('btn-zoom-in').onclick = () => {
  currentZoom = Math.min(currentZoom + 0.2, 2.5);
  document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
  rerenderAll();
};
document.getElementById('btn-zoom-out').onclick = () => {
  currentZoom = Math.max(currentZoom - 0.2, 0.6);
  document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
  rerenderAll();
};

async function rerenderAll() {
  renderedPages.clear();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const ph = document.getElementById('page-' + i);
    if (ph) ph.innerHTML = '<div style="padding:40px;color:#666">Обновление…</div>';
  }
  renderQueue = Array.from({length: pdfDoc.numPages}, (_, i) => i + 1);
  await processQueue();
}

function scrollToPage(num) {
  const el = document.getElementById('page-' + num);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('page-num').textContent = num;
}

// Блокируем copy/save/print
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'a', 'c', 'x'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    return false;
  }
});
window.addEventListener('beforeprint', () => { document.body.style.display = 'none'; });
window.addEventListener('afterprint', () => { document.body.style.display = ''; });

loadPdf();
</script>

</body>
</html>`;
}

function generateWatermarkLines(text) {
  // Горизонтальные строки по всей высоте экрана
  const safe = text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
  const lines = [];
  for (let top = 0; top < 100; top += 8) {
    lines.push(`<div class="wm-line" style="top:${top}%">${safe}</div>`);
  }
  return lines.join('\n  ');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
