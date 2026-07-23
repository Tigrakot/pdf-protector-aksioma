/**
 * Webhook от Pyrus → автоматически защищать PDF
 *
 * Pyrus шлёт:
 * POST { event: "task.created" | "comment" | "comment.added", task_id, user_id, task: {...} }
 *
 * Логика: если в задаче загружен PDF и нет защищённого — запускаем защиту
 */

import { pyrusRequest } from './_pyrus.js';

const FIELDS = {
  DOCUMENT: process.env.FIELD_DOCUMENT_CODE || 'u_photo2_source',
  PROTECTED: process.env.FIELD_PROTECTED_CODE || 'u_ne_source',
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'pyrus-webhook-pdf' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = req.body || {};
  const taskId = data.task_id || data.id;
  const event = data.event;

  console.log(`[WEBHOOK-PDF] event=${event} task=${taskId}`);

  if (!taskId) {
    return res.status(400).json({ error: 'No task_id' });
  }

  try {
    const taskRes = await pyrusRequest(`/tasks/${taskId}`);
    if (taskRes.error || !taskRes.task) {
      return res.status(200).json({ skipped: 'no access' });
    }

    const task = taskRes.task;
    const fieldMap = {};
    (task.fields || []).forEach(f => { fieldMap[f.code || f.id] = f.value; });

    const docFiles = fieldMap[FIELDS.DOCUMENT];
    const protectedFiles = fieldMap[FIELDS.PROTECTED];

    // Проверяем условия
    if (!docFiles || !Array.isArray(docFiles) || docFiles.length === 0) {
      console.log(`[WEBHOOK-PDF] task=${taskId} no docs, skip`);
      return res.status(200).json({ skipped: 'no docs' });
    }

    // Ищем PDF
    const hasPdf = docFiles.some(f => f.name && f.name.toLowerCase().endsWith('.pdf'));
    if (!hasPdf) {
      console.log(`[WEBHOOK-PDF] task=${taskId} no PDF, skip`);
      return res.status(200).json({ skipped: 'no PDF' });
    }

    // Уже защищён?
    if (protectedFiles && Array.isArray(protectedFiles) && protectedFiles.length > 0) {
      console.log(`[WEBHOOK-PDF] task=${taskId} already protected, skip`);
      return res.status(200).json({ skipped: 'already protected' });
    }

    console.log(`[WEBHOOK-PDF] task=${taskId} starting protection`);

    // Запускаем асинхронно
    protectAsync(taskId).catch(err => {
      console.error(`[WEBHOOK-PDF] protect FAILED for task ${taskId}:`, err);
    });

    return res.status(200).json({ accepted: true, task_id: taskId });
  } catch (error) {
    console.error('[WEBHOOK-PDF ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}

async function protectAsync(taskId) {
  const { default: protectHandler } = await import('./protect-pdf.js');

  const mockReq = {
    method: 'POST',
    body: { task_id: taskId },
    _startTime: Date.now(),
  };

  const mockRes = {
    status: (code) => ({
      json: (data) => {
        console.log(`[WEBHOOK-PDF] protect result for ${taskId}:`, code, JSON.stringify(data).substring(0, 300));
        return mockRes;
      },
    }),
    json: (data) => {
      console.log(`[WEBHOOK-PDF] protect result for ${taskId}:`, JSON.stringify(data).substring(0, 300));
      return mockRes;
    },
  };

  await protectHandler(mockReq, mockRes);
}
