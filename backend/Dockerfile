FROM node:22-alpine

# bcrypt and other native modules need build tooling on musl/alpine.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy source and Prisma schema, then generate the client.
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 5000

# Migrations are applied by the Railway start command (prisma migrate deploy).
CMD ["node", "src/app.js"]
