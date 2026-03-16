# Lobster Squad — OpenClaw Instance Manager

集中管理、监控和调度多个 OpenClaw Agent 实例的 Web 平台。支持多实例协作编排、团队管理、技能系统、沙箱管理和分享功能。

## 功能特性

### 实例管理
- 添加、编辑、删除 OpenClaw 实例，支持手动配置端点或通过 Novita Sandbox 一键创建
- WebSocket 驱动的实时状态同步（在线 / 离线 / 忙碌），每 30 秒自动健康检查

### 任务调度
- 向单个或多个实例派发任务，支持 `@all` 批量分发、`@team:xxx` 团队派发
- 实时流式展示 Agent 响应，支持图片附件（粘贴 / 拖拽上传）
- 支持任务取消

### 多实例协作引擎
- 基于角色的团队编排：Lead 负责规划与委派，Worker 执行具体任务
- 支持 `delegate` / `report` / `feedback` / `multi_delegate` / `done` 完整协作循环
- 执行图谱 (Graph)、时间线 (Timeline)、指标面板 (Metrics) 可视化
- 可配置最大轮次、深度、超时时间

### 团队管理
- 预置团队模板（开发团队等），也支持自定义角色
- 实例绑定到团队角色，支持团队级 Git 配置

### 技能系统
- 本地技能注册表 + SkillsMP 远程技能市场搜索与安装
- 按实例管理已安装技能，支持批量安装 / 卸载

### 沙箱管理
- 基于 Novita Sandbox SDK 自动创建沙箱环境（SSE 实时展示创建进度）
- 沙箱文件浏览与读取
- Git 凭证配置

### 分享功能
- 生成带过期时间（1h–3d）的分享链接
- 分享者可通过只读模式查看团队 / 实例状态

### 认证与数据隔离
- Google OAuth 登录 + JWT 令牌
- 兼容静态 ACCESS_TOKEN（CLI / 脚本场景）
- 基于 `ownerId` 的多用户数据隔离

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), Zustand, Lucide Icons |
| **后端** | Node.js, Express, TypeScript, WebSocket (ws) |
| **数据库** | PostgreSQL (主库) + Redis (缓存 + Pub/Sub) |
| **沙箱** | Novita Sandbox SDK |
| **上传** | 本地存储 / AWS S3 / Cloudflare R2 |
| **认证** | Google OAuth + JWT |
| **部署** | Docker, Railway |

## 项目结构

```
openclaw-instance-manage/
├── shared/
│   └── types.ts                        # 前后端共享类型定义
├── client/                             # 前端应用
│   └── src/
│       ├── App.tsx                     # 应用入口（路由、认证、主布局）
│       ├── components/
│       │   ├── StatusBar.tsx           # 顶部状态栏（统计、连接状态、用户）
│       │   ├── InstanceCard.tsx        # 实例卡片（状态、流式输出、操作）
│       │   ├── AddInstanceDialog.tsx   # 添加实例（手动 / Sandbox）
│       │   ├── TaskInput.tsx           # 任务输入栏（@ 选择、图片附件）
│       │   ├── TeamCard.tsx            # 团队卡片（成员、绑定、操作）
│       │   ├── CreateTeamDialog.tsx    # 创建团队（模板 / 自定义角色）
│       │   ├── ExecutionPanel.tsx      # 执行面板（日志、图谱、时间线、指标）
│       │   ├── ExecutionGraphView.tsx  # 执行图谱可视化
│       │   ├── ExecutionTimeline.tsx   # 执行时间线
│       │   ├── ExecutionMetricsPanel.tsx # 执行指标面板
│       │   ├── ExecutionReportDialog.tsx # 执行报告详情
│       │   ├── HistoryDrawer.tsx       # 历史抽屉（会话、执行记录）
│       │   ├── SessionDetailDialog.tsx # 会话详情弹窗
│       │   ├── TeamExecutionDetailDialog.tsx # 团队执行详情
│       │   ├── SkillsManagerDialog.tsx # 技能管理（本地 + 远程）
│       │   ├── FileBrowserDialog.tsx   # 沙箱文件浏览器
│       │   ├── SandboxConfigDialog.tsx # 沙箱 Git 配置
│       │   ├── TeamConfigDialog.tsx    # 团队 Git 配置
│       │   ├── ShareDialog.tsx         # 分享链接生成
│       │   ├── ShareView.tsx           # 分享页面（只读视图）
│       │   ├── SandboxLoadingAnimation.tsx # 沙箱创建动画
│       │   └── ui/                     # shadcn/ui 基础组件
│       ├── stores/                    # Zustand 全局状态管理
│       │   ├── instanceStore.ts      # 实例状态、任务流、WS 消息处理
│       │   ├── executionStore.ts     # 执行日志 / 流 / 历史
│       │   ├── teamStore.ts          # 团队列表
│       │   └── wsStore.ts            # WebSocket 连接、消息路由、派发动作
│       ├── hooks/
│       │   ├── types.ts               # 共享类型定义
│       │   ├── useAuth.ts            # 认证状态管理
│       │   └── useNotification.ts    # 浏览器通知
│       └── lib/
│           ├── api.ts                 # REST & WebSocket API 封装
│           ├── storage.ts             # localStorage 会话存储
│           ├── user.ts                # 用户身份标识与认证存储
│           └── utils.ts               # 工具函数
├── server/                             # 后端服务
│   └── src/
│       ├── index.ts                   # Express 入口
│       ├── ws.ts                      # WebSocket 服务 & 任务分发 & 健康检查
│       ├── store.ts                   # 数据层（PostgreSQL + Redis）
│       ├── db.ts                      # PostgreSQL 连接 & 数据库迁移
│       ├── persistence.ts            # CRUD 持久化操作
│       ├── auth.ts                    # JWT + ACCESS_TOKEN 认证中间件
│       ├── redis.ts                   # Redis 连接
│       ├── sandbox.ts                 # Novita Sandbox 创建 / 销毁
│       ├── upload.ts                  # 文件上传（local / S3 / R2）
│       ├── team-dispatch.ts           # 多实例协作引擎（Lead/Worker 编排）
│       ├── skill-loader.ts            # 技能加载器
│       ├── skill-registry.ts          # 技能注册表
│       ├── skills.ts                  # 技能管理逻辑
│       ├── skillsmp-client.ts         # SkillsMP 远程市场客户端
│       ├── device-identity.ts         # 设备标识
│       └── routes/
│           ├── instances.ts           # 实例 CRUD 路由
│           ├── tasks.ts               # 任务查询路由
│           ├── teams.ts               # 团队 CRUD + 角色管理路由
│           ├── sessions.ts            # 会话管理路由
│           ├── executions.ts          # 执行记录路由
│           ├── skills.ts              # 技能管理路由（本地 + 远程）
│           ├── share.ts               # 分享链接路由
│           ├── upload.ts              # 文件上传路由
│           ├── sandbox-config.ts      # 沙箱配置路由（Git 等）
│           ├── sandbox-files.ts       # 沙箱文件浏览路由
│           └── google-auth.ts         # Google OAuth 路由
├── skills/                             # 本地技能定义
├── roadmap/                            # 产品路线图
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

在项目根目录创建 `.env` 文件：

```env
# ─── 必填 ───
DATABASE_URL=postgresql://user:password@localhost:5432/openclaw
REDIS_URL=redis://localhost:6379

# ─── 认证（至少配置一种） ───
# Google OAuth（前后端均需配置）
GOOGLE_CLIENT_ID=your-google-client-id
VITE_GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-jwt-secret

# 静态访问令牌（可选，用于 CLI/脚本访问）
ACCESS_TOKEN=

# ─── 可选 ───
PORT=3002

# 上传存储方式：local / s3 / r2（默认 local）
UPLOAD_PROVIDER=local

# S3 / R2 配置（当 UPLOAD_PROVIDER 为 s3 或 r2 时必填）
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
UPLOAD_PUBLIC_URL=

# SkillsMP 远程技能市场 API Key（可选）
SKILLSMP_API_KEY=
```

### 启动开发环境

```bash
npm run dev
```

- 前端：`http://localhost:5174`（Vite 开发服务器，自动代理到后端）
- 后端：`http://localhost:3002`

### 构建生产版本

```bash
npm run build
npm start
```

## API 参考

### REST API

#### 实例管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | 健康检查 |
| GET | `/api/instances` | 是 | 获取实例列表及统计信息 |
| GET | `/api/instances/:id` | 是 | 获取单个实例详情 |
| POST | `/api/instances` | 是 | 创建实例（手动端点） |
| PUT | `/api/instances/:id` | 是 | 更新实例信息 |
| DELETE | `/api/instances/:id` | 是 | 删除实例（含沙箱清理） |
| POST | `/api/instances/sandbox` | 是 | 创建沙箱实例（SSE 流式响应） |
| POST | `/api/instances/:id/health` | 是 | 手动触发实例健康检查 |

#### 沙箱管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/instances/:id/sandbox/files` | 是 | 沙箱文件列表 |
| GET | `/api/instances/:id/sandbox/files/read` | 是 | 读取沙箱文件 |
| POST | `/api/instances/:id/sandbox/configure/git` | 是 | 配置沙箱 Git 凭证 |
| GET | `/api/instances/:id/sandbox/configure/git/status` | 是 | 查询 Git 配置状态 |

#### 团队管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/teams` | 是 | 团队列表 |
| GET | `/api/teams/templates` | 是 | 团队模板 |
| GET | `/api/teams/:id` | 是 | 团队详情 |
| POST | `/api/teams` | 是 | 创建团队 |
| PUT | `/api/teams/:id` | 是 | 更新团队 |
| DELETE | `/api/teams/:id` | 是 | 删除团队 |
| POST | `/api/teams/:id/roles` | 是 | 添加角色 |
| PUT | `/api/teams/:id/roles/:roleId` | 是 | 更新角色 |
| DELETE | `/api/teams/:id/roles/:roleId` | 是 | 删除角色 |
| POST | `/api/teams/:id/bind` | 是 | 绑定实例到角色 |
| POST | `/api/teams/:id/unbind` | 是 | 解绑实例 |
| POST | `/api/teams/:id/configure/git` | 是 | 团队 Git 配置 |
| GET | `/api/teams/:id/configure/git/status` | 是 | 团队 Git 状态 |

#### 任务与会话

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/tasks` | 是 | 任务列表 |
| GET | `/api/tasks/:id` | 是 | 任务详情 |
| GET | `/api/sessions` | 是 | 会话列表 |
| GET | `/api/sessions/:key` | 是 | 会话详情 |
| DELETE | `/api/sessions/:key` | 是 | 删除会话 |
| DELETE | `/api/sessions` | 是 | 清空所有会话 |

#### 执行记录

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/executions` | 是 | 执行列表 |
| GET | `/api/executions/:id` | 是 | 执行详情 |
| DELETE | `/api/executions/:id` | 是 | 删除执行 |
| DELETE | `/api/executions` | 是 | 清空所有执行 |

#### 技能管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/skills` | 是 | 技能注册表 |
| GET | `/api/skills/search?q=` | 是 | 搜索本地技能 |
| GET | `/api/skills/:id/readme` | 是 | 获取技能 README |
| GET | `/api/skills/instance/:id` | 是 | 实例已安装技能 |
| POST | `/api/skills/instance/:id/install` | 是 | 批量安装技能 |
| POST | `/api/skills/instance/:id/uninstall` | 是 | 批量卸载技能 |
| POST | `/api/skills/instance/:id/install-remote` | 是 | 安装远程技能 |
| GET | `/api/skills/instance/:id/sync` | 是 | 同步已安装技能 |
| GET | `/api/skills/remote/status` | 是 | SkillsMP 配置状态 |
| GET | `/api/skills/remote/search?q=&mode=` | 是 | SkillsMP 远程搜索 |
| GET | `/api/skills/remote/content?url=` | 是 | 获取远程 SKILL.md |

#### 分享

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/share` | 是 | 创建分享链接 |
| GET | `/api/share` | 是 | 分享 token 列表 |
| DELETE | `/api/share/:id` | 是 | 撤销分享 |
| GET | `/api/share/view/:token` | 否 | 查看分享内容（公开） |

#### 认证

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/google` | 否 | Google OAuth 登录 |
| GET | `/api/auth/me` | 是 | 获取当前用户信息 |

#### 文件上传

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/upload` | 可选 | 上传文件 |

### WebSocket

连接地址：`/ws?userId=<userId>&token=<accessToken>`
分享模式：`/ws?shareToken=<token>`

#### 客户端 → 服务端

| 事件 | 说明 |
|------|------|
| `task:dispatch` | 派发任务到指定实例 |
| `team:dispatch` | 派发团队协作任务 |
| `task:cancel` | 取消任务 |
| `execution:cancel` | 取消执行 |

#### 服务端 → 客户端

| 事件 | 说明 |
|------|------|
| `instance:status` | 实例状态更新 |
| `task:status` | 任务状态变更 |
| `task:stream` | 任务响应流式文本 |
| `task:complete` | 任务完成 |
| `task:error` | 任务失败 |
| `task:cancelled` | 任务已取消 |
| `execution:started` | 执行开始 |
| `execution:turn_start` | 执行轮次开始 |
| `execution:turn_stream` | 执行轮次流式输出 |
| `execution:turn_complete` | 执行轮次完成 |
| `execution:turn_failed` | 执行轮次失败 |
| `execution:edge_created` | 执行边创建（图谱更新） |
| `execution:warning` | 执行警告 |
| `execution:completed` | 执行完成 |
| `execution:timeout` | 执行超时 |
| `execution:cancelled` | 执行已取消 |

## 数据库模型

| 表 | 说明 |
|----|------|
| `users` | 用户（Google OAuth 登录） |
| `instances` | Agent 实例，可绑定 team/role |
| `teams` | 团队 |
| `roles` | 角色，1:N 关联 team |
| `tasks` | 任务记录，关联实例与会话 |
| `sessions` | 会话记录 |
| `executions` | 团队执行记录（含 turns、edges、graph、metrics） |
| `share_tokens` | 分享 token（含过期时间） |
| `instance_skills` | 实例已安装技能 |

## Docker 部署

```bash
docker build -t lobster-squad .
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=your-secret \
  lobster-squad
```

也支持通过 Railway 一键部署（已包含 `railway.toml` 配置，健康检查路径 `/api/health`）。

## License

MIT
