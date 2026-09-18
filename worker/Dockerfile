# worker/Dockerfile
FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORTA=8080 \
    SWIPE_TMP=/dados/tmp

# Binários do sistema: ffmpeg (merge do yt-dlp), wget/zip (espelho), chromium (single-file e Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget zip unzip python3 python3-pip ffmpeg chromium \
      fonts-liberation fonts-noto-color-emoji libnss3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp e gallery-dl como binários fixos em /usr/local/bin.
# O pip no Debian já instala o console script do gallery-dl em /usr/local/bin; o `if` só cobre o
# caso de ele ir para outro lugar — linkar o caminho nele mesmo criaria um symlink pendurado.
# Os `test -x` no fim falham o build aqui, em vez de o worker descobrir no primeiro job.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && pip3 install --break-system-packages --no-cache-dir gallery-dl \
 && if [ ! -x /usr/local/bin/gallery-dl ]; then ln -s "$(command -v gallery-dl)" /usr/local/bin/gallery-dl; fi \
 && test -x /usr/local/bin/gallery-dl && test -x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json ./
# O npm já cria o shim executável em node_modules/.bin/single-file (o arquivo real do pacote
# chama-se single-file-node.js, então nunca aponte direto para ele).
RUN npm install --omit=dev --no-audit --no-fund \
 && ln -sf /app/node_modules/.bin/single-file /usr/local/bin/single-file \
 && test -x /app/node_modules/.bin/single-file

COPY src ./src
RUN mkdir -p /dados/tmp /cookies && chown -R node:node /dados /cookies

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
