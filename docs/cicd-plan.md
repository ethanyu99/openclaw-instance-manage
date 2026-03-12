# Lobster Squad — CI/CD 与基础设施优化方案

> 生成日期: 2026-03-12 | DevOps 工程师出品

---

## 目录

1. [现状分析](#1-现状分析)
2. [GitHub Actions CI/CD](#2-github-actions-cicd)
3. [Docker 优化](#3-docker-优化)
4. [测试基础设施](#4-测试基础设施)
5. [监控与日志](#5-监控与日志)

---

## 1. 现状分析

### 项目结构

```
Lobster-Squad/
├── client/          # React 19 + Vite 7 + TailwindCSS 4
├── server/          # Express + PostgreSQL + Redis + WebSocket
├── shared/          # 前后端共享代码
├── Dockerfile       # 已有多阶段构建
└── railway.toml     # Railway 部署配置
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, Vite 7, Zustand, TailwindCSS 4 |
| 后端 | Express, PostgreSQL (pg), Redis (ioredis), WebSocket (ws) |
| 认证 | Google OAuth + JWT |
| 存储 | AWS S3 |
| 部署 | Docker → Railway |

### 当前 Dockerfile 分析

已有两阶段构建（builder + production），但存在优化空间：
- ❌ 没有使用 `alpine` 基础镜像
- ❌ 生产阶段拷贝了完整 `node_modules`（含 devDependencies）
- ❌ 没有 non-root 用户
- ❌ 没有 `.dockerignore`
- ❌ 没有利用缓存层优化

### 当前 Railway 配置

已配置健康检查 `/api/health`，重启策略合理。

---

## 2. GitHub Actions CI/CD

### 2.1 PR 检查流水线

```yaml
# 文件路径: .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: |
          npm ci
          cd server && npm ci
          cd ../client && npm ci

      - name: Lint client
        run: cd client && npm run lint

      - name: Type check client
        run: cd client && npx tsc -b --noEmit

      - name: Type check server
        run: cd server && npx tsc --noEmit

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: lobster_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: |
          npm ci
          cd server && npm ci
          cd ../client && npm ci

      - name: Run server tests
        run: cd server && npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/lobster_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret
          NODE_ENV: test

      - name: Run client tests
        run: cd client && npm test -- --run

  build:
    name: Docker Build
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VITE_GOOGLE_CLIENT_ID=${{ vars.VITE_GOOGLE_CLIENT_ID }}

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [build]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: |
          npm ci
          cd server && npm ci
          cd ../client && npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npx playwright test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/lobster_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret
```

### 2.2 部署流水线

```yaml
# 文件路径: .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy
        run: railway up --service ${{ vars.RAILWAY_SERVICE_ID }}
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Health check
        run: |
          echo "等待部署生效..."
          sleep 30
          for i in $(seq 1 10); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ vars.PRODUCTION_URL }}/api/health" || echo "000")
            if [ "$STATUS" = "200" ]; then
              echo "✅ 健康检查通过"
              exit 0
            fi
            echo "尝试 $i/10 — 状态码: $STATUS"
            sleep 10
          done
          echo "❌ 健康检查失败"
          exit 1

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v2
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "🚨 Lobster Squad 部署失败! PR: ${{ github.event.head_commit.message }}"
            }
```

### 2.3 需要配置的 GitHub Secrets / Variables

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `RAILWAY_TOKEN` | Railway API Token |
| Secret | `SLACK_WEBHOOK` | Slack 通知 Webhook（可选） |
| Variable | `RAILWAY_SERVICE_ID` | Railway 服务 ID |
| Variable | `PRODUCTION_URL` | 生产环境 URL |
| Variable | `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |

---

## 3. Docker 优化

### 3.1 优化后的 Dockerfile

```dockerfile
# 文件路径: Dockerfile
# ============================================
# Stage 1: 依赖安装
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# 仅拷贝 lock 文件，最大化缓存
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

# 如果有 openclaw 目录
COPY --from=builder --chown=app:app /app/server/openclaw ./server/dist/server/openclaw

ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist

USER app

EXPOSE 3001

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/dist/server/src/index.js"]
```

**优化点总结：**

| 优化 | 效果 |
|---|---|
| `node:20-alpine` | 镜像体积减少 ~600MB |
| 独立 `prod-deps` 阶段 | 生产镜像不含 devDependencies |
| `npm ci --ignore-scripts` | 更安全的依赖安装 |
| non-root `app` 用户 | 安全加固 |
| `tini` 作为 PID 1 | 正确处理信号和僵尸进程 |
| 依赖层与代码层分离 | 构建缓存命中率提高 |

### 3.2 .dockerignore

```dockerignore
# 文件路径: .dockerignore
node_modules
*/node_modules
.git
.github
.env
.env.*
!.env.example
*.md
docs/
.vscode/
.idea/
client/dist
server/dist
coverage/
*.log
.DS_Store
```

### 3.3 本地开发 docker-compose.yml

```yaml
# 文件路径: docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: lobster
      POSTGRES_PASSWORD: lobster
      POSTGRES_DB: lobster_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lobster"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

使用方式：

```bash
# 启动基础设施
docker compose up -d

# 启动应用开发服务器
npm run dev
```

对应的 `.env` 配置：

```env
DATABASE_URL=postgresql://lobster:lobster@localhost:5432/lobster_dev
REDIS_URL=redis://localhost:6379
PORT=3002
JWT_SECRET=dev-secret-change-in-prod
```

---

## 4. 测试基础设施

### 4.1 框架选择：Vitest

**选择理由：**
- 项目已使用 Vite 7，Vitest 零配置集成
- 比 Jest 快 2-5 倍（原生 ESM，无需 transform）
- 兼容 Jest API，迁移成本低

### 4.2 安装依赖

```bash
# 客户端测试
cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event

# 服务端测试
cd server && npm install -D vitest supertest @types/supertest
```

### 4.3 Vitest 配置 — 客户端

```typescript
// 文件路径: client/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
});
```

```typescript
// 文件路径: client/src/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

### 4.4 Vitest 配置 — 服务端

```typescript
// 文件路径: server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/test/**'],
    },
    // 数据库测试可能需要串行
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
```

### 4.5 在 package.json 中添加测试脚本

```jsonc
// client/package.json — 添加到 scripts
"test": "vitest",
"test:coverage": "vitest run --coverage"

// server/package.json — 添加到 scripts
"test": "vitest",
"test:coverage": "vitest run --coverage"
```

### 4.6 测试示例

```typescript
// 文件路径: server/src/__tests__/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
// 假设 app 从一个模块导出
// import { app } from '../app';

describe('GET /api/health', () => {
  it('应返回 200 状态码', async () => {
    // const res = await request(app).get('/api/health');
    // expect(res.status).toBe(200);
    // expect(res.body).toHaveProperty('status', 'ok');
    expect(true).toBe(true); // 占位 — 请替换为实际测试
  });
});
```

```tsx
// 文件路径: client/src/__tests__/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// import App from '../App';

describe('App', () => {
  it('应能正常渲染', () => {
    // render(<App />);
    // expect(screen.getByRole('main')).toBeInTheDocument();
    expect(true).toBe(true); // 占位
  });
});
```

### 4.7 E2E 测试 — Playwright

```bash
npm init playwright@latest
```

```typescript
// 文件路径: playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run build && npm start',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

---

## 5. 监控与日志

### 5.1 健康检查增强

```typescript
// 文件路径: server/src/routes/health.ts
import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const router = Router();

router.get('/api/health', async (req, res) => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // PostgreSQL
  try {
    const start = Date.now();
    const pool: Pool = req.app.locals.pool;
    await pool.query('SELECT 1');
    checks.postgres = { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    checks.postgres = { status: 'error' };
  }

  // Redis
  try {
    const start = Date.now();
    const redis: Redis = req.app.locals.redis;
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    checks.redis = { status: 'error' };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    checks,
  });
});

export default router;
```

### 5.2 结构化日志

推荐 **pino** — 最快的 Node.js JSON 日志库。

```bash
cd server && npm install pino pino-http
npm install -D pino-pretty  # 开发用
```

```typescript
// 文件路径: server/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: {
    service: 'lobster-squad',
    env: process.env.NODE_ENV || 'development',
  },
});
```

```typescript
// Express 中间件 — 在 app 初始化时添加
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';

app.use(pinoHttp({ logger }));
```

### 5.3 错误追踪 — Sentry

```bash
cd server && npm install @sentry/node
cd ../client && npm install @sentry/react
```

```typescript
// 文件路径: server/src/lib/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}
```

```tsx
// 文件路径: client/src/lib/sentry.ts
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  });
}
```

### 5.4 监控工具推荐

| 工具 | 用途 | 成本 |
|---|---|---|
| **Sentry** | 错误追踪 + 性能监控 | 免费额度足够小团队 |
| **Better Stack** (Logtail) | 日志聚合（接收 pino JSON） | 免费 1GB/月 |
| **Better Uptime** | 外部可用性监控 | 免费计划可用 |
| **Grafana Cloud** | 指标仪表盘（如需深度监控） | 免费额度充足 |

### 5.5 需新增的环境变量

```env
# 添加到 .env.example
SENTRY_DSN=
VITE_SENTRY_DSN=
LOG_LEVEL=info
```

---

## 实施优先级

| 优先级 | 任务 | 预估工时 |
|---|---|---|
| 🔴 P0 | `.dockerignore` + Dockerfile 优化 | 1h |
| 🔴 P0 | `ci.yml` — PR 检查流水线 | 2h |
| 🟡 P1 | `deploy.yml` — 自动部署 | 1h |
| 🟡 P1 | 结构化日志 (pino) | 2h |
| 🟡 P1 | 健康检查增强 | 1h |
| 🟢 P2 | Vitest 配置 + 测试模板 | 3h |
| 🟢 P2 | Sentry 接入 | 2h |
| 🟢 P2 | docker-compose.yml | 0.5h |
| 🔵 P3 | Playwright E2E | 4h |
| 🔵 P3 | 日志聚合平台接入 | 2h |

---

> 💡 所有配置文件可直接复制使用。根据优先级逐步落地，先搞定 CI + Docker 优化，再铺测试和监控。
