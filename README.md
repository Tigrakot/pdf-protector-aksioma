# PDF Protector АКСИОМА (Railway)

Бот для автоматической защиты PDF-документов в задачах Pyrus.
Использует `qpdf` (шифрование + permissions) + `reportlab` (водяной знак).

## Что делает

1. Сотрудник загружает PDF в задачу Pyrus
2. Бот через webhook подхватывает
3. Скачивает PDF
4. Добавляет **диагональный водяной знак** "АКСИОМА — Конфиденциально" на каждую страницу
5. **Шифрует** AES-256 с паролем
6. **Запрещает** копирование/печать/редактирование
7. Кладёт защищённый файл в поле `НЭ` (или другое)
8. Пишет комментарий с паролем

## Структура

```
pdf-protector-aksioma/
├── api/
│   ├── _pyrus.js          # Pyrus auth + download/upload
│   ├── protect_pdf.py     # Python: водяной знак + qpdf
│   ├── protect-pdf.js     # Express endpoint
│   └── pyrus-webhook.js   # Auto-trigger webhook
├── server.js              # Express entry point
├── Dockerfile             # с qpdf + Python
├── railway.json
├── package.json
└── README.md
```

## Деплой на Railway

### 1. Создай репо на GitHub

```bash
cd /Users/vladimirosadchiy/Desktop/pdf-protector-aksioma
git init
git add .
git commit -m "PDF protector bot"
gh repo create pdf-protector-aksioma --public --source=. --push
```

### 2. Railway → New Project → Deploy from GitHub

- Выбери `pdf-protector-aksioma`
- Railway найдёт `Dockerfile` и соберёт (с qpdf + Python)

### 3. Добавь env vars

- `PYRUS_BOT_LOGIN` — email бота
- `PYRUS_BOT_KEY` — security key
- `PDF_PASSWORD` — пароль для PDF (по умолчанию `axioma2026`)
- `PDF_WATERMARK` — текст водяного знака (по умолчанию `АКСИОМА — Конфиденциально`)

### 4. Получи URL

`https://pdf-protector-aksioma-production.up.railway.app`

## Использование

### Webhook (рекомендуется)

В форме 2451012 Pyrus → ⚙️ → Webhooks → Добавить:
- **URL**: `https://<railway-url>/api/pyrus-webhook`
- **Событие**: `task.created` + `comment.added`

Сотрудник загружает PDF → бот автоматом защищает.

### Прямой вызов (для теста)

```bash
curl -X POST https://<railway-url>/api/protect-pdf \
  -H "Content-Type: application/json" \
  -d '{"task_id": 368153730}'
```

## Поля формы (по code)

Бот использует **code** (стабильнее id):

| Code | Что |
|------|-----|
| `u_photo2_source` | Поле с PDF (читает) |
| `u_ne_source` | Поле для защищённого PDF (пишет) |

Можно переопределить через env:
- `FIELD_DOCUMENT_CODE` (default: `u_photo2_source`)
- `FIELD_PROTECTED_CODE` (default: `u_ne_source`)

## Как работает защита

### Водяной знак
- Диагональный (45°)
- Полупрозрачный (alpha=0.25)
- По всей странице (несколько строк)
- На **каждой** странице

### Шифрование (qpdf)
- **AES-256** (максимальная стойкость)
- Пароль пользователя: `axioma2026` (по умолчанию)
- Пароль владельца: тот же

### Permissions (qpdf)
- ❌ Copy (extract): **запрещено**
- ❌ Print high-res: **запрещено**
- ✅ Print low-res: **разрешено** (для просмотра)
- ❌ Modify: **запрещено**
- ❌ Document assembly: **запрещено**

## ⚠️ Ограничения

- 100% защиты нет — скриншот и OCR всё ещё возможны
- Но водяной знак остаётся при копировании
- Пароль нужно передавать **отдельно** (SMS, лично) — иначе смысла нет

## Разработка локально

```bash
brew install qpdf
pip3 install pypdf reportlab
npm install
PDF_PASSWORD=test123 PYRUS_BOT_LOGIN=... PYRUS_BOT_KEY=... npm start
```
