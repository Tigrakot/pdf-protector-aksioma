/**
 * Парсер multipart/form-data через busboy (battle-tested)
 * Поддерживает: text fields + file fields
 */

import Busboy from 'busboy';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return { fields: {}, files: {} };
  }

  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};
    let hasError = false;

    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE },
      });
    } catch (e) {
      return reject(e);
    }

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;

      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_FILE_SIZE) {
          hasError = true;
          stream.destroy();
          return reject(new Error(`File too large: ${filename}`));
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (!hasError) {
          files[name] = {
            filename: filename || 'file',
            contentType: mimeType || 'application/octet-stream',
            buffer: Buffer.concat(chunks),
            size,
          };
        }
      });

      stream.on('error', (err) => {
        hasError = true;
        reject(err);
      });
    });

    busboy.on('finish', () => {
      if (!hasError) resolve({ fields, files });
    });

    busboy.on('error', (err) => {
      reject(err);
    });

    req.pipe(busboy);
  });
}
