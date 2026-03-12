# 后端架构审查报告

> 审查日期：2026-03-12  
> 审查范围：`server/src/` 全部文件 + `shared/types.ts`  
> 项目技术栈：Node.js + Express + TypeScript + PostgreSQL + Redis + WebSocket

---

## 目录

1. [代码架构](#1-代码架构)
2. [数据层](#2-数据层)
3. [WebSocket 架构](#3-websocket-架构)
4. [协作引擎](#4-协作引擎team-dispatch)
5. [性能与可扩展性](#5-性能与可扩展性)
6. [总结与优先级排序](#6-总结与优先级排序)

---

## 1. 代码架构

### 1.1 分层评估

**当前状况：**

项目采用了三层结构：
- **Routes 层**（`server/src/routes/`）：11 个路由文件，处理 HTTP 请求和参数校验
- **Store 层**（`server/src/store.ts`，808 行）：业务逻辑 + 缓存 + 状态管理
- **Persistence 层**（`server/src/persistence.ts`，481 行）：纯 CRUD 操作

**问题分析：**

- **缺少独立的 Service/Business Logic 层**。`store.ts` 承担了两个职责：业务逻辑编排（如 session 管理、share token 生命周期）和 Redis 缓存管理。Routes 文件有时也包含业务逻辑（如 `sandbox-config.ts` 349 行）。
- **store.ts 是"上帝对象"**：它导出一个巨大的 `store` 对象，包含 Instance、Task、Team、Role、ShareToken、Session 等所有领域的操作方法。随着功能增长，维护成本线性上升。

**改进方案：** **[P1]**

```
server/src/
├── routes/           # 保持不变，仅做参数校验和路由分发
├── services/         # 新增：业务逻辑层
│   ├── instance.service.ts
│   ├── team.service.ts
│   ├── task.service.ts
│   ├── session.service.ts
│   └── share.service.ts
├── repositories/     # 重命名 persistence.ts，按领域拆分
│   ├── instance.repo.ts
│   ├── team.repo.ts
│   ├── task.repo.ts
│   └── share.repo.ts
├── cache/            # 提取 Redis 缓存逻辑
│   └── redis-cache.ts
├── db.ts
├── redis.ts
└── index.ts
```

### 1.2 store.ts 拆分

**当前状况：** 808 行，包含 7 个领域（Instance、Task、Team、Role、Binding、ShareToken、Session）的所有操作。

**问题分析：**
- 所有方法耦合在一个 `store` 常量对象中，无法独立测试
- 缓存逻辑（`cacheGet/cacheSet/cacheDel/invalidateOwnerCaches`）内联在业务方法中，职责混乱
- `rowToXxx` 转换函数有 6 个，混合在文件顶部

**改进方案：** **[P1]**

按领域拆分为独立模块，每个模块导出一个 class 或函数集合。缓存策略可通过装饰器或中间层统一管理。

### 1.3 team-dispatch.ts 拆分

**当前状况：** 1180 行，包含协作引擎的全部逻辑。

**问题分析：**
- Prompt 构建（~150 行）、Action 解析（~100 行）、SSE 流处理（~100 行）、执行循环（~400 行）、图构建和指标计算（~100 行）全部在一个文件
- 纯函数（`parseActionFromOutput`、`buildTurnPrompt`、`computeMetrics`）和有副作用的函数（`callInstance`、`dispatchToTeam`）混在一起，难以单元测试

**改进方案：** **[P1]**

```
server/src/engine/
├── dispatch.ts           # dispatchToTeam 主循环
├── prompt-builder.ts     # buildTurnPrompt, buildActionInstructions 等
├── action-parser.ts      # parseActionFromOutput, validateAction, extractBalancedJson
├── instance-caller.ts    # callInstance, callInstanceRaw, SSE 流处理
├── graph.ts              # buildExecutionGraph, computeMetrics
└── types.ts              # RoleInstance, BroadcastFn 等内部类型
```

### 1.4 错误处理

**当前状况：**
- 各 Route 文件各自处理错误，格式为 `res.status(xxx).json({ error: '...' })`
- 没有统一的错误处理中间件
- `ws.ts` 中 catch 块直接吞掉异常（`catch { // ignore parse errors }`）
- 未捕获的 Promise rejection 没有全局处理器（`index.ts` 仅 catch 启动错误）

**改进方案：** **[P0]**

```typescript
// middleware/error-handler.ts
class AppError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
  }
}

function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
}

// index.ts
process.on('unhandledRejection', (err) => { ... });
process.on('uncaughtException', (err) => { ... });
```

---

## 2. 数据层

### 2.1 数据库迁移

**当前状况：** `db.ts`（206 行）使用内联 SQL 的"累积式"迁移——每次启动依序执行 10 个迁移步骤，用 `IF NOT EXISTS` 和 `ADD COLUMN IF NOT EXISTS` 保证幂等性。

**问题分析：**
- **不支持回滚**。一旦迁移出错，只能手动修复数据库。
- **无版本追踪**。无法知道当前数据库处于哪个迁移版本。
- 所有 DDL 在应用启动时执行，如果多实例同时启动可能产生竞争。
- 当前方式对早期项目可行，但随着 schema 变化增多会变得脆弱。

**改进方案：** **[P2]**

引入 `node-pg-migrate` 或 `knex` migrations，每个迁移独立文件、有 up/down、有版本号。短期内可加一个 `schema_version` 表做简单版本追踪。

### 2.2 CRUD 操作（persistence.ts）

**当前状况：** 481 行，提供所有实体的 load/save/delete 操作。使用参数化查询，无 SQL 注入风险。

**问题分析：**
- `loadInstances()`、`loadTeams()`、`loadTasks()` 等 `load*` 函数加载全表数据到 `Map`，但实际上 `initStore()` 中已不再调用它们（改为 DB-first 模式）。**这些函数是死代码**。
- `loadShareTokens()` 同样是全表加载，但只在启动时使用过（如果使用的话）。
- 每个 save 操作都是独立事务，批量操作时无事务保证（如 `createTeam` 中先 saveTeam 再循环 saveRole，如果中间失败会导致数据不一致）。

**改进方案：** **[P1]**

1. 删除未使用的 `load*` 全表函数
2. 对 `createTeam`、`deleteTeam` 等多步操作使用数据库事务：
```typescript
async function createTeam(ownerId: string, data: {...}, roles: [...]): Promise<TeamPublic> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // ... all inserts ...
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

### 2.3 N+1 查询

**当前状况：**

存在多处 N+1 查询模式：

1. **`store.getInstances()`**：查一次 `instances JOIN roles`，然后 **循环每个 instance 做两次 Redis GET**（status + currentTask）。10 个 instance = 20 次 Redis 调用。
2. **`store.getAllInstancesRaw()`**：查全表后循环每个 instance 做一次 Redis GET。
3. **`store.getTeams()` → `buildTeamPublic()`**：每个 team 触发两次额外查询（roles + instances）。5 个 team = 10 次额外 PG 查询。
4. **ws.ts 健康检查 `setInterval`**：每 30 秒遍历所有 instance，每个 instance 做一次 HTTP 请求 + 两次 store 调用。

**改进方案：** **[P0]**

1. Redis 批量操作使用 `mget`：
```typescript
const keys = instances.map(i => `ocm:instance:status:${i.id}`);
const statuses = await redis.mget(...keys);
```
2. `buildTeamPublic` 改为单次 JOIN 查询：
```sql
SELECT t.*, r.*, i.id as bound_instance_id
FROM teams t
LEFT JOIN roles r ON r.team_id = t.id
LEFT JOIN instances i ON i.team_id = t.id AND i.role_id = r.id
WHERE t.owner_id = $1
```
3. 健康检查使用 `Promise.allSettled` 并行而非串行。

### 2.4 连接池管理

**当前状况：** `max: 10`，`idleTimeoutMillis: 30000`，`connectionTimeoutMillis: 5000`。有 `pool.on('error')` 处理器。

**问题分析：**
- 配置合理，适合单实例部署
- 没有连接池监控（使用率、等待时间等）
- `closeDB()` 存在但未在 graceful shutdown 中调用

**改进方案：** **[P2]**

```typescript
// index.ts
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  server.close();
  await closeRedis();
  await closeDB();
  process.exit(0);
});
```

### 2.5 数据模型评估

**当前状况：** `shared/types.ts`（499 行）定义了完整的类型系统，包括 12+ 个核心接口。

**问题分析：**
- 类型定义清晰，前后端共享设计合理
- `WSMessage.payload` 使用 `any` 类型，丢失了类型安全
- `ExecutionRecord.turns` 和 `edges` 使用 `unknown[]`，在 persistence 层做 JSON 序列化，但读回时没有校验

**改进方案：** **[P2]**

```typescript
// 用联合类型替代 any
interface WSMessage<T extends WSMessageType = WSMessageType> {
  type: T;
  payload: WSPayloadMap[T];  // 映射类型
  // ...
}
```

---

## 3. WebSocket 架构

### 3.1 消息协议

**当前状况：** 基于 JSON 的消息协议，定义了 20+ 种消息类型（`WSMessageType`）。消息结构包含 `type`、`payload`、`instanceId`、`taskId`、`sessionKey`、`timestamp`。

**问题分析：**
- 协议设计整体合理，覆盖了任务调度、流式输出、执行引擎等场景
- **缺少协议版本号**。未来协议变更时客户端无法优雅降级
- **缺少消息 ID**。无法做请求-响应匹配或消息去重
- 客户端发送的消息没有校验（`ws.on('message')` 仅 `JSON.parse`，无 schema 验证）

**改进方案：** **[P2]**

```typescript
interface WSMessage {
  v: 1;                    // 协议版本
  id?: string;             // 消息 ID（可选，用于请求-响应模式）
  type: WSMessageType;
  payload: unknown;
  // ...
}
```

### 3.2 心跳 / 重连机制

**当前状况：**
- **服务端无心跳**。没有 ping/pong 帧检测死连接。
- 客户端断开后，`ws.on('close')` 仅从 `clients` Map 中删除，无清理逻辑。
- 没有连接超时检测。

**问题分析：**
- 如果客户端网络断开但 TCP 连接未关闭（半开连接），服务端会持续向死连接发送消息，浪费资源。
- 长任务执行期间如果连接断开，任务结果会丢失（仅 DB 持久化了 task 状态，但实时流数据丢失）。

**改进方案：** **[P0]**

```typescript
// 服务端心跳
const HEARTBEAT_INTERVAL = 30000;
const CLIENT_TIMEOUT = 60000;

wss.on('connection', (ws) => {
  (ws as any).isAlive = true;
  ws.on('pong', () => { (ws as any).isAlive = true; });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!(ws as any).isAlive) return ws.terminate();
    (ws as any).isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

### 3.3 水平扩展

**当前状况：** 使用 Redis Pub/Sub 实现跨进程 WS 消息广播。每个 owner 有独立的 Redis channel（`ocm:ws:{ownerId}`）。`broadcastToOwner` 统一走 Redis publish，subscriber 回调负责本地投递。

**问题分析：**
- **设计正确**，已经具备了多实例部署的基本能力。
- 但 `psubscribe('ocm:ws:*')` 使用通配符订阅，当用户数量增长时，每个节点都会收到所有用户的消息，即使该用户没有连接到本节点。
- 健康检查（30s 轮询所有 instance）在多实例部署时会产生重复检查。

**改进方案：** **[P1]**

1. 改为精确订阅：当用户连接时 `subscribe(channel)`，断开时 `unsubscribe(channel)`
2. 健康检查使用分布式锁（Redis `SET NX EX`）或指定一个实例负责
3. 考虑引入 Redis Streams 替代 Pub/Sub，获得持久化能力（断线重连后可回放消息）

### 3.4 ws.ts 代码重复

**当前状况：** `ws.ts`（666 行）中 share 连接和普通连接的消息处理逻辑高度重复（`task:dispatch` 处理逻辑几乎相同，复制了约 40 行）。

**改进方案：** **[P2]**

提取共享的消息处理函数，share 连接只需额外做权限校验。

---

## 4. 协作引擎（team-dispatch）

### 4.1 状态机实现

**当前状况：** 执行引擎使用 `while (pendingTurns.length > 0)` 循环驱动状态流转。Turn 有 4 种状态：`pending → running → completed/failed`。Action 有 5 种类型：`delegate`、`multi_delegate`、`report`、`feedback`、`done`。

**问题分析：**
- **不是严格的状态机**。状态流转逻辑分散在 `executeSingleTurn` 的 switch-case 和外层 while 循环中，没有显式的状态转移表。
- 但**实际运行是可靠的**——Turn 状态只会单向流转（pending→running→completed/failed），不存在非法状态回退。
- `pendingTurns` 数组既当队列又当栈用（`push` + `shift`），FIFO 语义正确但用数组实现 `shift` 是 O(n)。

**改进方案：** **[P2]**

如果需要更严格的保证，可引入显式状态机库（如 `xstate`），但当前实现已满足需求。`pendingTurns` 可替换为 `LinkedList` 或双端队列以优化 shift 性能（实际影响很小因为轮次数有限）。

### 4.2 并发控制

**当前状况：**
- `multi_delegate` 支持并行执行：相同 `parentTurnId` 和 `depth` 的 Turn 会被 batch 到一起，用 `Promise.all` 并行执行。
- 每个 Turn 独立调用 instance，无全局并发限制。

**问题分析：**
- **缺少并发度限制**。如果一个 `multi_delegate` 委派 10 个子任务，会同时向 10 个 instance 发起请求。如果 instance 数量少于 10，会导致资源争用。
- 并行 Turn 共享 `pendingTurns` 数组，但由于 `Promise.all` 等待所有完成后才继续外层循环，不会产生竞争条件。
- **但有一个潜在 bug**：并行 Turn 内部的 `pendingTurns.push()` 和 `seqCounter++` 不是原子操作。多个并行的 `executeSingleTurn` 可能产生重复的 `seq` 号（虽然 JS 单线程保证了同步代码的原子性，但 `await` 之后回来时可能 interleave）。

**改进方案：** **[P1]**

1. 添加并发度限制（如 `p-limit`）：
```typescript
import pLimit from 'p-limit';
const concurrency = pLimit(5);
await Promise.all(parallelBatch.map(turn => concurrency(() => executeSingleTurn(turn))));
```
2. `seqCounter` 改为在创建 Turn 时分配（已经是这样 ✓，`createTurn` 是同步函数，在 `push` 到 `pendingTurns` 之前调用）。

### 4.3 超时处理

**当前状况：**
- 单 Turn 超时：`DEFAULT_CONFIG.turnTimeoutMs = 600_000`（10 分钟），通过 `setTimeout + abort` 实现。
- 全局轮次上限：`maxTurns = 50`，达到后强制 Lead 总结。
- 深度上限：`maxDepth = 15`，达到后在 prompt 中提示不要继续委派。

**问题分析：**
- 超时配置合理且可通过 `userConfig` 覆盖
- **缺少全局执行超时**。如果每个 Turn 都在超时边界内完成但累计执行时间极长（50 turns × 10 min = 8.3 hours），没有全局截止时间。
- 深度限制只是 prompt 级别的"建议"，如果 LLM 不遵守仍会继续委派（虽然 `depth >= maxDepth` 时只添加提示文本）。

**改进方案：** **[P1]**

1. 添加全局执行超时（如 `maxExecutionTimeMs`）
2. 深度限制应硬性执行——当 `depth >= maxDepth` 时自动将 delegate action 转换为 report

### 4.4 断线恢复

**当前状况：**
- 执行状态存储在 **内存中的 `execution` 对象**里
- 每个关键节点调用 `persistCurrentExecution()` 写入 PostgreSQL
- 服务重启时，`initStore()` 将 running/pending 的 tasks 标记为 failed
- **不支持断线恢复**——执行引擎重启后无法恢复中断的执行

**问题分析：**
- 对于长时间运行的协作任务（可能持续数十分钟），服务重启意味着整个执行丢失
- DB 中虽然持久化了 turns 和 edges，但只是用于历史查看，无法恢复执行

**改进方案：** **[P1]**

短期方案：
- 服务重启后，将中断的 execution 标记为 `interrupted`（而非直接丢弃）
- 通知前端用户执行被中断，允许手动重新发起

长期方案：
- 将 `pendingTurns` 队列持久化到 Redis
- 启动时检查是否有未完成的 execution，尝试恢复执行

---

## 5. 性能与可扩展性

### 5.1 Redis 使用

**当前状况：**

Redis 用于 4 个场景：
1. **缓存**：instance 列表、stats、instance 原始数据（TTL 30s）
2. **实时状态**：instance status/currentTask（TTL 120s）
3. **Session 管理**：session key 映射、team usage 标记
4. **Pub/Sub**：跨进程 WS 消息广播

**问题分析：**
- 使用合理，key 命名规范（`ocm:` 前缀）
- `initStore()` 启动时 `keys('ocm:*')` + `del` 清空所有缓存——**生产环境这是危险操作**，`KEYS` 命令会阻塞 Redis
- share token 缓存 TTL 与 token 过期时间对齐，设计细致
- 两个 Redis 连接（main + subscriber），合理

**改进方案：** **[P1]**

1. `KEYS` 替换为 `SCAN`：
```typescript
async function flushOcmKeys(redis: Redis) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'ocm:*', 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
}
```
2. 考虑使用 Redis key prefix + `FLUSHDB` on dedicated DB number

### 5.2 消息队列需求

**当前状况：** 任务调度通过直接函数调用实现（`dispatchToInstance` 和 `dispatchToTeam` 在 WS 消息处理器中直接 async 调用）。

**问题分析：**
- 如果服务在任务执行中重启，正在进行的任务会丢失
- 无法对任务进行优先级排序、限流、延迟执行
- 当前规模下直接调用足够，但随着用户增长和并发执行增多，会成为瓶颈

**改进方案：** **[P2]**

引入 BullMQ 作为任务队列：
```typescript
// queues/task.queue.ts
const taskQueue = new Queue('task-dispatch', { connection: redisConnection });

// ws.ts 中
await taskQueue.add('dispatch', { ownerId, instanceId, taskId, content }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});

// workers/task.worker.ts
const worker = new Worker('task-dispatch', async (job) => {
  await dispatchToInstance(job.data.ownerId, ...);
}, { connection: redisConnection, concurrency: 10 });
```

优先在协作引擎（`team-dispatch`）中引入，因为它的执行时间最长、最需要持久化和恢复能力。

### 5.3 数据库索引

**当前状况：** `db.ts` 中定义了 17 个索引，覆盖了所有外键和常用查询路径。

**问题分析：**
- 索引覆盖充分，`owner_id`、`team_id`、`instance_id`、`session_key` 等高频查询字段都有索引
- `share_tokens.token` 有 UNIQUE 约束 + 独立索引（冗余，UNIQUE 自带索引）
- **缺少复合索引**：`tasks` 表经常按 `(owner_id, session_key)` 或 `(session_key, owner_id)` 查询
- `executions` 表查询常用 `(owner_id, created_at DESC)`，可加复合索引

**改进方案：** **[P2]**

```sql
-- 删除冗余索引
DROP INDEX IF EXISTS idx_share_tokens_token;  -- UNIQUE 约束已自带

-- 添加复合索引
CREATE INDEX idx_tasks_owner_session ON tasks(owner_id, session_key);
CREATE INDEX idx_executions_owner_created ON executions(owner_id, created_at DESC);
```

---

## 6. 总结与优先级排序

### P0（立即修复）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | 无统一错误处理中间件，无全局异常捕获 | `index.ts`, routes | 未捕获异常导致进程崩溃 |
| 2 | N+1 Redis 查询（循环 GET） | `store.ts` getInstances/getAllInstancesRaw | 性能随 instance 数量线性下降 |
| 3 | WebSocket 无心跳检测 | `ws.ts` | 半开连接资源泄漏 |

### P1（近期优化）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 4 | store.ts 拆分（808 行上帝对象） | `store.ts` | 可维护性 |
| 5 | team-dispatch.ts 拆分（1180 行） | `team-dispatch.ts` | 可测试性 |
| 6 | persistence 层缺少事务 | `persistence.ts` | 数据一致性风险 |
| 7 | Redis `KEYS` 命令阻塞 | `store.ts` initStore | 生产环境 Redis 阻塞 |
| 8 | WS Pub/Sub 通配符订阅 | `ws.ts` | 多实例部署时带宽浪费 |
| 9 | 协作引擎缺少并发度限制 | `team-dispatch.ts` | 资源争用 |
| 10 | 协作引擎缺少全局执行超时 | `team-dispatch.ts` | 无限执行风险 |
| 11 | 协作引擎无断线恢复能力 | `team-dispatch.ts` | 长任务中断丢失 |
| 12 | N+1 PG 查询（buildTeamPublic） | `store.ts` | 团队数量增长时性能下降 |

### P2（长期改进）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 13 | 数据库迁移无版本管理和回滚 | `db.ts` | 运维风险 |
| 14 | WSMessage.payload 使用 any 类型 | `shared/types.ts` | 类型安全 |
| 15 | WS 协议无版本号和消息 ID | `ws.ts` / `shared/types.ts` | 可演进性 |
| 16 | 引入消息队列（BullMQ） | 全局 | 可靠性和可扩展性 |
| 17 | 索引优化（复合索引、去冗余） | `db.ts` | 查询性能 |
| 18 | Graceful shutdown | `index.ts` | 资源泄漏 |
| 19 | persistence.ts 中死代码清理 | `persistence.ts` | 代码整洁 |
| 20 | ws.ts 消息处理逻辑重复 | `ws.ts` | 可维护性 |

---

*报告结束。建议按 P0 → P1 → P2 顺序逐步推进，每个阶段完成后可做一次集成测试验证。*
