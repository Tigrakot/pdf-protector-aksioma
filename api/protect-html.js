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
    const filenameAscii = filename.replace(/[А-Яа-яЁё]/g, '_');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(html);

    console.log(`[HTML] done: ${html.length} chars`);
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
    overflow: hidden;
  }
  .header {
    background: #0a0a0a;
    color: #fff;
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #333;
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
    gap: 12px;
    border-bottom: 1px solid #333;
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
  .toolbar button:hover { background: #666; }
  .toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar .info {
    color: #aaa;
    padding: 6px 14px;
    font-size: 13px;
  }
  #pdf-container {
    height: calc(100vh - 100px);
    overflow: auto;
    padding: 20px;
    text-align: center;
    background: #1a1a1a;
  }
  #pdf-container canvas {
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    margin-bottom: 16px;
    max-width: 100%;
  }
  .watermark-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 9999;
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 200px,
      rgba(200, 200, 200, 0.05) 200px,
      rgba(200, 200, 200, 0.05) 400px
    );
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
  <button onclick="prevPage()">◀ Назад</button>
  <span class="info"><span id="page-num">1</span> / <span id="page-count">?</span></span>
  <button onclick="nextPage()">Вперёд ▶</button>
  <button onclick="zoomOut()">−</button>
  <span class="info" id="zoom-level">100%</span>
  <button onclick="zoomIn()">+</button>
</div>

<div id="pdf-container"></div>
<div class="watermark-overlay"></div>

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

async function loadPdf() {
  try {
    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    document.getElementById('page-count').textContent = pdfDoc.numPages;
    renderPage(currentPage);
  } catch (err) {
    console.error(err);
  }
}

async function renderPage(num) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: currentZoom * 1.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  canvas.style.userSelect = 'none';

  const container = document.getElementById('pdf-container');
  container.innerHTML = '';
  container.appendChild(canvas);

  await page.render({ canvasContext: context, viewport }).promise;
  document.getElementById('page-num').textContent = num;
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
}

function nextPage() {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    currentPage++;
    renderPage(currentPage);
  }
}

function zoomIn() {
  currentZoom = Math.min(currentZoom + 0.2, 3.0);
  document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
  renderPage(currentPage);
}

function zoomOut() {
  currentZoom = Math.max(currentZoom - 0.2, 0.5);
  document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
  renderPage(currentPage);
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

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
