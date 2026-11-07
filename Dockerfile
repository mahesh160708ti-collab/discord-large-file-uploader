# Multi-stage Docker build for Discord Large File Uploader

# Stage 1: Build TypeScript artifacts
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY src/db/migrations ./dist/db/migrations

RUN mkdir -p /app/uploads && chown -R node:node /app

# Security: Run as unprivileged user
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
