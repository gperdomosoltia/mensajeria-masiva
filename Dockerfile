FROM node:20-slim

# Instalamos el paquete chromium SOLO por sus librerías de sistema (libnss, gtk, etc.),
# NO para usar su binario: la versión 150 de Debian hace SIGTRAP al arrancar en este host.
# Puppeteer descargará su propio Chrome (Chrome for Testing), probado con esta versión.
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libadwaita-1-0 \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer usa su Chrome empaquetado (descargado en npm install) en esta ruta.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
