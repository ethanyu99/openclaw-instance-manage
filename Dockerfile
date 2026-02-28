FROM node:20-slim AS builder

WORKDIR /app

# Install root deps
COPY package.json package-lock.json* ./
RUN npm install

# Install server deps
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

# Install client deps
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install

# Copy source
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Build client
RUN cd client && npm run build

# Build server
RUN cd server && npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/server/package.json /app/server/package-lock.json* ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist

EXPOSE 3001

CMD ["node", "server/dist/server/src/index.js"]
