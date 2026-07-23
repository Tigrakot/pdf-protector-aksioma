/**
 * Защита PDF в задаче Pyrus
 *
 * POST /api/protect-pdf
 * { task_id: 12345, password: "...", watermark: "..." }
 *
 * Скачивает PDF из поля, защищает (водяной знак + шифрование), заменяет в задаче
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pyrusRequest, downloadPyrusFile, uploadPyrusFile } from './_pyrus.js';

const execAsync = promisify(exec);

const FIELDS = {
  // Поля которые бот будет мониторить (по code)
  DOCUMENT_FIELD: process.env.FIELD_DOCUMENT_CODE || 'u_photo2_source',
  PROTECTED_FIELD: process.env.FIELD_PROTECTED_CODE || 'u_ne_source',
};

const PASSWORD = process.env.PDF_PASSWORD || 'axioma2026';
const WATERMARK = process.env.PDF_WATERMARK || 'АКСИОМА — Конфиденциально';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'pdf-protector-aksioma' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { task_id: taskId, password, watermark } = req.body || {};

  if (!taskId) {
    return res.status(400).json({ error: 'No task_id' });
  }

  try {
    console.log(`[PROTECT] task=${taskId} start`);

    // 1. Получаем задачу
    const taskRes = await pyrusRequest(`/tasks/${taskId}`);
    if (taskRes.error || !taskRes.task) {
      return res.status(403).json({ error: taskRes.error || 'No access' });
    }
    const task = taskRes.task;

    // 2. Ищем PDF в поле документа
    const docField = (task.fields || []).find(f => f.code === FIELDS.DOCUMENT_FIELD);
    if (!docField || !docField.value) {
      return res.status(400).json({ error: `No file in field ${FIELDS.DOCUMENT_FIELD}` });
    }

    const files = Array.isArray(docField.value) ? docField.value : [docField.value];
    const pdfFile = files.find(f => f.name && f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF in document field' });
    }

    console.log(`[PROTECT] task=${taskId} file: ${pdfFile.name} (${pdfFile.size} bytes)`);

    // 3. Скачиваем PDF
    const pdfBuffer = await downloadPyrusFile(pdfFile.id);
    const inputPath = join(tmpdir(), `in-${taskId}.pdf`);
    const outputPath = join(tmpdir(), `out-${taskId}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    // 4. Защищаем через Python скрипт
    const finalPassword = password || PASSWORD;
    const finalWatermark = watermark || WATERMARK;

    console.log(`[PROTECT] task=${taskId} running protection (password=${finalPassword})`);

    const scriptPath = join(process.cwd(), 'api', 'protect_pdf.py');
    try {
      await execAsync(
        `python3 ${scriptPath} ${inputPath} ${outputPath} ${finalPassword} "${finalWatermark}"`
      );
    } catch (execErr) {
      console.error(`[PROTECT] python failed:`, execErr.message);
      throw new Error(`PDF protection failed: ${execErr.message}`);
    }

    // 5. Заливаем защищённый PDF обратно
    const protectedBuffer = await readFile(outputPath);
    const protectedName = pdfFile.name.replace(/\.pdf$/i, '_ЗАЩИЩЕНО.pdf');

    console.log(`[PROTECT] task=${taskId} uploading (${protectedBuffer.length} bytes)`);
    const uploaded = await uploadPyrusFile(protectedName, protectedBuffer);

    // 6. Удаляем оригинал из задачи
    console.log(`[PROTECT] task=${taskId} removing original file ${pdfFile.id}`);
    // Pyrus не имеет API для удаления отдельного вложения,
    // поэтому заменяем поле целиком (или кладём в protected field)

    // Привязываем к защищённому полю (u_ne_source)
    let attachmentIds = [];
    let technicalCommentId = null;
    try {
      const attachResult = await pyrusRequest(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          text: '.',
          attachments: [uploaded.id],
        }),
      });

      const taskData = attachResult.task || attachResult;
      const lastComment = (taskData.comments || []).slice(-1)[0];
      if (lastComment && lastComment.attachments) {
        attachmentIds = lastComment.attachments.map(a => a.id);
        technicalCommentId = lastComment.id;
      }
    } catch (err) {
      console.error(`[PROTECT] task=${taskId} attach FAILED:`, err.message);
    }

    // Привязываем к полю + пишем комментарий с информацией
    if (attachmentIds.length > 0) {
      try {
        await pyrusRequest(`/tasks/${taskId}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            text: `🔒 PDF защищён!\n\n`
                + `• Файл: ${protectedName}\n`
                + `• Размер: ${Math.round(protectedBuffer.length / 1024)} KB\n`
                + `• Пароль: \`${finalPassword}\`\n\n`
                + `Защита: водяной знак + шифрование AES-256.\n`
                + `Пароль передавайте сотруднику лично или через SMS.`,
            field_updates: [
              { code: FIELDS.PROTECTED_FIELD, value: attachmentIds.map(id => ({ attachment_id: id })) },
            ],
          }),
        });
      } catch (err) {
        console.error(`[PROTECT] task=${taskId} final comment FAILED:`, err.message);
      }
    }

    // 7. Удаляем старый файл из поля документа (через замену value на пустой)
    // Pyrus API не позволяет удалить отдельное вложение, только заменить поле
    try {
      await pyrusRequest(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          field_updates: [
            // Очищаем поле документа от PDF
            // (если там только этот файл)
            { code: FIELDS.DOCUMENT_FIELD, value: null },
          ],
        }),
      });
    } catch (err) {
      console.warn(`[PROTECT] task=${taskId} could not clear document field:`, err.message);
    }

    // Cleanup
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}

    console.log(`[PROTECT] task=${taskId} done`);

    return res.status(200).json({
      success: true,
      task_id: taskId,
      original: { id: pdfFile.id, name: pdfFile.name, size: pdfFile.size },
      protected: { id: uploaded.id, name: protectedName, size: protectedBuffer.length },
      password: finalPassword,
      duration_ms: Date.now() - req._startTime,
    });

  } catch (error) {
    console.error('[PROTECT ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
