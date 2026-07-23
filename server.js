/**
 * Express сервер для pdf-protector-aksioma
 * Web-интерфейс: загрузи PDF → получи защищённый PDF или HTML-просмотрщик
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import protectPdfUploadHandler from './api/protect-pdf-upload.js';
import protectHtmlHandler from './api/protect-html.js';
import pyrusWebhookHandler from './api/pyrus-webhook.js';
import { parseMultipart } from './api/_multipart.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для multipart
app.use(async (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    try {
      const { fields, files } = await parseMultipart(req);
      req.body = { ...fields };
      for (const [name, file] of Object.entries(files)) {
        req.body[name] = file;
      }
      console.log('[DEBUG] parsed fields:', Object.keys(fields), 'files:', Object.keys(files));
      next();
    } catch (err) {
      console.error('[MULTIPART ERROR]', err);
      res.status(400).json({ error: 'Multipart parse error: ' + err.message });
    }
  } else {
    next();
  }
});

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-protector-aksioma' });
});

// Главная — web-интерфейс
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.all('/api/protect-pdf-upload', (req, res) => protectPdfUploadHandler(req, res));
app.all('/api/protect-html', (req, res) => protectHtmlHandler(req, res));
app.all('/api/pyrus-webhook', (req, res) => pyrusWebhookHandler(req, res));
app.all('/_debug', async (req, res) => {
  console.log('[DEBUG] req.body keys:', Object.keys(req.body || {}));
  res.json({ keys: Object.keys(req.body || {}), body: req.body });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] pdf-protector-aksioma listening on port ${PORT}`);
});
