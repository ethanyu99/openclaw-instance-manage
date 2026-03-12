# ============================================
# Stage 1: 依赖安装
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/

RUN npm ci --ignore-scripts && \
    cd server && npm ci --ignore-scripts && \
    cd ../client && npm ci --ignore-scripts

# ============================================
# Stage 2: 构建
# ============================================
FROM node:20-alpine AS builder

ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules

COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/
COPY package.json ./

RUN cd client && npm run build && \
    cd ../server && npm run build

# ============================================
# Stage 3: 生产依赖
# ============================================
FROM node:20-alpine AS prod-deps

WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./

RUN npm ci --omit=dev --ignore-scripts

# ============================================
# Stage 4: 运行
# ============================================
FROM node:20-alpine AS runner

RUN apk add --no-cache tini && \
    addgroup -g 1001 -S app && \
    adduser -S app -u 1001 -G app

WORKDIR /app

COPY --from=prod-deps --chown=app:app /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=app:app /app/server/dist ./server/dist
COPY --from=builder --chown=app:app /app/server/package.json ./server/package.json
COPY --from=builder --chown=app:app /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist

USER app

EXPOSE 3001

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/dist/server/src/index.js"]
