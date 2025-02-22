FROM node:18-slim

# Установка зависимостей для Puppeteer и Chromium
RUN apt-get update \
    && apt-get install -y wget gnupg chromium \
    && apt-get install -y \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем package.json
COPY package.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Запускаем бота
CMD ["npm", "start"] 
