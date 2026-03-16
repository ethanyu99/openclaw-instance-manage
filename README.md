# Lobster Squad — OpenClaw Instance Manager

[中文文档](./README.zh-CN.md)

A web platform for centrally managing, monitoring, and orchestrating multiple [OpenClaw](https://github.com/openclaw/openclaw) Agent instances. Supports multi-instance team collaboration, skill management, sandbox provisioning, and sharing.

## Features

- **Instance Management** — Add, edit, and remove OpenClaw instances. Real-time status via WebSocket with automatic health checks.
- **Task Dispatch** — Send tasks to single or multiple instances (`@all`, `@team:xxx`). Streaming responses with image attachment support.
- **Multi-Instance Collaboration Engine** — Role-based team orchestration (Lead/Worker). Full `delegate → report → feedback → done` lifecycle with execution graph, timeline, and metrics visualization.
- **Team Management** — Built-in team templates or custom roles. Bind instances to roles with team-level Git configuration.
- **Skills System** — Local skill registry + SkillsMP marketplace search and remote installation.
- **Sandbox Management** — Auto-provision sandbox environments via Novita Sandbox SDK. File browsing and Git credential configuration.
- **Sharing** — Generate expiring share links (1h–3d) with read-only views.
- **Auth & Data Isolation** — Google OAuth + JWT. Static `ACCESS_TOKEN` for CLI/scripts. Per-user data isolation via `ownerId`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui, Zustand |
| **Backend** | Node.js, Express, TypeScript, WebSocket (ws) |
| **Database** | PostgreSQL + Redis |
| **Sandbox** | Novita Sandbox SDK |
| **Upload** | Local / AWS S3 / Cloudflare R2 |
| **Auth** | Google OAuth + JWT |
| **Deploy** | Docker, Railway |

## Quick Start

### Prerequisites

- Node.js >= 24
- PostgreSQL
- Redis

### Install

```bash
git clone https://github.com/ethanyu99/Lobster-Squad.git
cd Lobster-Squad
npm run install:all
```

### Configure

```bash
cp .env.example .env
# Edit .env with your database credentials and auth config
```

Key environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Same as above (for frontend) |
| `JWT_SECRET` | Optional | JWT signing secret |
| `ACCESS_TOKEN` | Optional | Static token for CLI/script access |

### Run

```bash
# Development
npm run dev
# Frontend: http://localhost:5174 | Backend: http://localhost:3002

# Production
npm run build
npm start
```

### Docker

```bash
docker build -t lobster-squad .
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=your-secret \
  lobster-squad
```

Also supports one-click deploy via [Railway](https://railway.app/) (`railway.toml` included).

## Project Structure

```
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend (TypeScript + WebSocket)
├── shared/          # Shared type definitions
├── skills/          # Local skill definitions
├── scripts/         # Utility scripts
├── docs/            # Architecture & planning docs
├── roadmap/         # Product roadmap
├── Dockerfile
├── docker-compose.yml
└── railway.toml
```

## API Overview

Full API reference in [README.zh-CN.md](./README.zh-CN.md#api-参考).

### REST Endpoints

- `GET /api/health` — Health check
- `GET/POST/PUT/DELETE /api/instances` — Instance CRUD
- `POST /api/instances/sandbox` — Create sandbox instance (SSE)
- `GET/POST/PUT/DELETE /api/teams` — Team & role management
- `GET /api/tasks` — Task history
- `GET /api/sessions` — Session management
- `GET /api/executions` — Execution records
- `GET/POST /api/skills` — Skill registry & installation
- `POST /api/share` — Generate share links
- `POST /api/auth/google` — Google OAuth

### WebSocket

Connect: `/ws?userId=<id>&token=<token>`

Events: `task:dispatch`, `task:stream`, `task:complete`, `team:dispatch`, `execution:*`, etc.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
