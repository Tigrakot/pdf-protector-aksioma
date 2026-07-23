# Railway Dockerfile — с qpdf и Python (reportlab)
FROM node:20-slim

# Системные зависимости
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf \
    python3 \
    python3-pip \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python библиотеки
RUN pip3 install --break-system-packages --no-cache-dir pypdf reportlab

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Копируем исходники
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
