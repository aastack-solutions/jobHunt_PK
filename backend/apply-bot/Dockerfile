# Playwright needs a real glibc userland for Chromium — node:*-alpine (musl) won't
# reliably run it, so this deliberately does NOT match backend/Dockerfile's alpine base.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Installs Chromium + all required OS-level libraries in one step.
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 8100
CMD ["node", "src/server.js"]
