# Railway Dockerfile — с qpdf, Python и Playwright Chromium
FROM node:20-slim

# Системные зависимости (qpdf + Chromium deps для Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf \
    python3 \
    python3-pip \
    fonts-dejavu-core \
    ca-certificates \
    # Chromium runtime deps
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python библиотеки
RUN pip3 install --break-system-packages --no-cache-dir pypdf reportlab pymupdf pillow

# Переменные для Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Устанавливаем Chromium для Playwright
RUN npx playwright install chromium

# Копируем исходники
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
