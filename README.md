# OpenClaw Instance Manager

OpenClaw 实例管理平台 —— 用于集中管理、监控和调度多个 OpenClaw Agent 实例的 Web 应用。

## 功能特性

- **实例管理** — 添加、编辑、删除 OpenClaw 实例，支持手动配置端点或通过 Novita Sandbox 一键创建
- **实时状态监控** — WebSocket 驱动的实例状态同步（在线 / 离线 / 忙碌），每 30 秒自动健康检查
- **任务调度** — 向单个或多个实例派发任务，支持 `@all` 批量分发
- **流式响应** — 实时流式展示 Agent 的响应内容，逐字输出
- **图片附件** — 支持粘贴 / 拖拽上传图片，附加到任务中发送
- **会话历史** — 本地存储的会话记录，支持 Markdown 渲染查看
- **Sandbox 管理** — 基于 Novita Sandbox SDK 自动创建沙箱环境，SSE 实时展示创建进度
- **多用户隔离** — 基于 User ID 的数据隔离，每个用户只能管理自己的实例

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), Lucide Icons |
| **后端** | Node.js, Express, TypeScript, WebSocket (ws) |
| **沙箱** | Novita Sandbox SDK |
| **存储** | PostgreSQL (source of truth), Redis (缓存 + Pub/Sub), localStorage（会话历史） |
| **上传** | 本地存储 / AWS S3 / Cloudflare R2 |
| **部署** | Docker, Railway |

## 项目结构

```
openclaw-instance-manage/
├── shared/
│   └── types.ts                  # 前后端共享类型定义
├── client/                       # 前端应用
│   ├── src/
│   │   ├── App.tsx               # 应用入口布局
│   │   ├── components/
│   │   │   ├── AddInstanceDialog.tsx    # 添加实例对话框
│   │   │   ├── InstanceCard.tsx         # 实例卡片
│   │   │   ├── TaskInput.tsx            # 任务输入栏
│   │   │   ├── StatusBar.tsx            # 顶部状态栏
│   │   │   ├── HistoryDrawer.tsx        # 会话历史侧栏
│   │   │   ├── SessionDetailDialog.tsx  # 会话详情弹窗
│   │   │   ├── SandboxLoadingAnimation.tsx # 沙箱创建动画
│   │   │   └── ui/                      # shadcn/ui 基础组件
│   │   ├── hooks/
│   │   │   └── useInstanceManager.ts    # 核心状态管理 Hook
│   │   └── lib/
│   │       ├── api.ts            # REST & WebSocket API 封装
│   │       ├── storage.ts        # localStorage 会话存储
│   │       ├── user.ts           # 用户身份标识
│   │       └── utils.ts          # 工具函数
│   └── vite.config.ts
├── server/                       # 后端服务
│   ├── src/
│   │   ├── index.ts              # Express 入口
│   │   ├── ws.ts                 # WebSocket 服务 & 任务分发
│   │   ├── store.ts              # 内存数据存储
│   │   ├── sandbox.ts            # Novita Sandbox 管理
│   │   ├── persistence.ts        # JSON 文件持久化
│   │   ├── auth.ts               # 认证中间件
│   │   ├── upload.ts             # 上传服务（S3/R2/本地）
│   │   └── routes/
│   │       ├── instances.ts      # 实例 CRUD 路由
│   │       ├── tasks.ts          # 任务查询路由
│   │       └── upload.ts         # 文件上传路由
│   └── data/
│       └── instances.json        # 实例持久化数据
├── Dockerfile
├── railway.toml
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 20
- npm
- PostgreSQL
- Redis

### 安装依赖

```bash
npm run install:all
```

### 配置环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```env
# PostgreSQL 连接字符串
DATABASE_URL=postgresql://user:password@localhost:5432/openclaw

# Redis 连接字符串
REDIS_URL=redis://localhost:6379

# 服务端口（默认 3002）
PORT=3002

# 访问令牌（可选，设置后所有 API 请求需携带 Bearer Token）
ACCESS_TOKEN=

# 上传存储方式：local / s3 / r2（默认 local）
UPLOAD_PROVIDER=local

# S3 / R2 配置（当 UPLOAD_PROVIDER 为 s3 或 r2 时必填）
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
UPLOAD_PUBLIC_URL=
```

### 启动开发环境

```bash
npm run dev
```

前端访问地址：`http://localhost:5174`（Vite 开发服务器，自动代理到后端）
后端服务地址：`http://localhost:3002`

### 构建生产版本

```bash
npm run build
npm start
```

## API 参考

### REST API

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | 健康检查 |
| GET | `/api/instances` | 是 | 获取实例列表及统计信息 |
| GET | `/api/instances/:id` | 是 | 获取单个实例详情 |
| POST | `/api/instances` | 是 | 创建实例（手动端点） |
| PUT | `/api/instances/:id` | 是 | 更新实例信息 |
| DELETE | `/api/instances/:id` | 是 | 删除实例 |
| POST | `/api/instances/sandbox` | 是 | 创建沙箱实例（SSE 流式响应） |
| POST | `/api/instances/:id/health` | 是 | 手动触发实例健康检查 |
| GET | `/api/tasks` | 是 | 获取任务列表 |
| GET | `/api/tasks/:id` | 是 | 获取任务详情 |
| POST | `/api/upload` | 否 | 上传文件 |

认证方式：请求头携带 `X-User-Id`，若配置了 `ACCESS_TOKEN` 还需携带 `Authorization: Bearer <token>`。

### WebSocket

连接地址：`/ws?userId=<userId>&token=<accessToken>`

#### 客户端 → 服务端

| 事件 | 说明 |
|------|------|
| `task:dispatch` | 派发任务到指定实例 |

#### 服务端 → 客户端

| 事件 | 说明 |
|------|------|
| `instance:status` | 实例状态更新 |
| `task:status` | 任务状态变更 |
| `task:stream` | 任务响应流式文本 |
| `task:complete` | 任务完成 |
| `task:error` | 任务失败 |

## Docker 部署

```bash
docker build -t openclaw-instance-manage .
docker run -p 3001:3001 -e ACCESS_TOKEN=your_token openclaw-instance-manage
```

也支持通过 Railway 一键部署（已包含 `railway.toml` 配置）。

## License

MIT
