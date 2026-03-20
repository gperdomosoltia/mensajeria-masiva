FROM node:20-slim

# Instalamos Chromium y las dependencias necesarias
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Variable de entorno para que Puppeteer sepa dónde está el navegador
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
# Instalamos omitiendo la descarga del navegador interno de Puppeteer para ahorrar espacio
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]