# Lobster Squad 安全审计报告

**审计日期**: 2026-03-12  
**审计范围**: 认证授权、输入验证、敏感信息、API 安全、依赖安全

---

## 发现汇总

| 严重程度 | 数量 |
|---------|------|
| Critical | 3 |
| High | 4 |
| Medium | 5 |
| Low | 3 |

---

## Critical

### C1. JWT 默认密钥硬编码

- **位置**: `server/src/auth.ts:20`
- **描述**: `getJwtSecret()` 在 `JWT_SECRET` 环境变量未设置时，回退到硬编码的 `'openclaw-default-jwt-secret'`。攻击者可用此默认密钥伪造任意用户的 JWT token。
- **影响**: 完全绕过认证，冒充任意用户。
- **修复建议**: 启动时强制要求 `JWT_SECRET`，未设置则拒绝启动。
  ```typescript
  function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET environment variable is required');
    return secret;
  }
  ```

### C2. WebSocket 认证缺陷 — userId 由客户端提供

- **位置**: `server/src/ws.ts` — `extractUserId()` 函数及 `setupWebSocket` 连接处理
- **描述**: 普通 WebSocket 连接时，`userId` 从 URL query 参数 `?userId=xxx` 获取，仅靠 `validateAccessToken` 验证 token。当 `ACCESS_TOKEN` 未设置时（`if (!accessToken) return true`），**任何人无需 token 即可连接 WebSocket 并指定任意 userId**，从而操作该用户的所有实例和任务。
- **影响**: 未配置 `ACCESS_TOKEN` 时，完全绕过 WebSocket 认证，可操控任意用户数据。
- **修复建议**: WebSocket 连接必须验证 JWT token，从 token 中提取 userId 而非信任客户端参数。
  ```typescript
  // 从 JWT 中提取 userId，不信任客户端提供的 userId
  const token = url.searchParams.get('token');
  const payload = token ? verifyToken(token) : null;
  if (!payload) { ws.close(4001, 'Unauthorized'); return; }
  const userId = payload.userId;
  ```

### C3. ACCESS_TOKEN 模式下 userId 由客户端控制

- **位置**: `server/src/auth.ts:55-60`
- **描述**: 使用 `ACCESS_TOKEN` 认证时，`userId` 从 `X-User-Id` header 获取，意味着持有 ACCESS_TOKEN 的人可以冒充任意用户。如果 ACCESS_TOKEN 泄露，攻击面等同于数据库完全暴露。
- **影响**: ACCESS_TOKEN 泄露 = 全用户数据泄露。
- **修复建议**: ACCESS_TOKEN 应绑定固定的管理员 userId，或废弃此模式，全部改用 JWT。

---

## High

### H1. 文件上传路由未认证

- **位置**: `server/src/index.ts:42` — `app.use('/api/upload', uploadRouter)`
- **描述**: 上传路由未应用 `authMiddleware`，任何人可以匿名上传文件。
- **影响**: 匿名用户可消耗服务器存储（本地模式）或 S3 费用，可能上传恶意文件。
- **修复建议**:
  ```typescript
  app.use('/api/upload', authMiddleware, uploadRouter);
  ```

### H2. 上传路由未验证 SVG 内容（存储型 XSS）

- **位置**: `server/src/routes/upload.ts:9` — ALLOWED_TYPES 包含 `'image/svg+xml'`
- **描述**: SVG 文件可包含内嵌 JavaScript (`<script>`)。上传后的文件通过 `express.static` 直接提供服务（`server/src/index.ts:48`），浏览器会执行其中的脚本。
- **影响**: 存储型 XSS，可窃取用户 JWT token。
- **修复建议**: 
  1. 从 ALLOWED_TYPES 中移除 `image/svg+xml`，或
  2. 对 SVG 进行消毒处理（DOMPurify），或
  3. 上传文件的响应 header 设置 `Content-Disposition: attachment` 和 `Content-Type: application/octet-stream`。

### H3. CORS 完全开放

- **位置**: `server/src/index.ts:36` — `app.use(cors())`
- **描述**: 使用默认 CORS 配置，允许任意域名跨域请求，包括携带凭据。
- **影响**: 恶意网站可代替用户发起 API 请求。
- **修复建议**:
  ```typescript
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  }));
  ```

### H4. `updateInstance` 和 `deleteInstance` 缺少 ownerId 校验

- **位置**: `server/src/routes/instances.ts` — PUT `/:id` 路由
- **描述**: `PUT /:id` 路由先调用 `store.getInstance(ownerId, id)` 做了校验，但 `store.updateInstance(id, data)` 本身不含 ownerId 参数。如果 store 层被其他入口调用（如 WebSocket health check 定时器中的 `store.updateInstance`），可能跨用户更新状态。当前 HTTP 路由层做了防护，但 store 层缺少防线属于纵深防御不足。
- **影响**: 目前 HTTP 路由安全，但 store 层缺少保护会在后续扩展中引入风险。
- **修复建议**: `updateInstance` 和 `deleteInstance` 增加 ownerId 参数并在 SQL WHERE 中约束。

---

## Medium

### M1. 无 Rate Limiting

- **位置**: 全局 — `server/src/index.ts`
- **描述**: 所有 API 和 WebSocket 均无速率限制。
- **影响**: 暴力破解 token、DoS 攻击、批量上传。
- **修复建议**: 使用 `express-rate-limit`：
  ```typescript
  import rateLimit from 'express-rate-limit';
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 100 }));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10 }));
  app.use('/api/upload', rateLimit({ windowMs: 60_000, max: 20 }));
  ```

### M2. JWT 有效期过长（30 天）

- **位置**: `server/src/auth.ts:22` — `JWT_EXPIRES_IN = '30d'`
- **描述**: JWT 一旦签发 30 天内有效，且无吊销机制。token 泄露后无法使其失效。
- **影响**: 泄露的 token 在 30 天内持续有效。
- **修复建议**: 缩短到 1-7 天，并实现 refresh token 机制或 token 黑名单。

### M3. 日志可能记录敏感信息

- **位置**: `server/src/ws-logger.ts` — `logWS` 和 `createLogEntry`
- **描述**: WS logger 记录完整的请求和响应内容（最多 2000 字符），开发模式下写入文件。如果 OpenClaw 实例的 token 出现在请求中，可能被记录。`server/src/sandbox-config.ts` 中 Git PAT 也通过 task 方式发送，会被 WS logger 捕获。
- **影响**: 敏感凭据可能泄露到日志文件中。
- **修复建议**: 在 `createLogEntry` 中对 `Authorization`、`token`、`pat`、`credential` 等关键字段脱敏。

### M4. Google OAuth 的 `clientUserId` 参数可被滥用

- **位置**: `server/src/routes/google-auth.ts:18`
- **描述**: 新用户注册时接受客户端提供的 `clientUserId` 作为用户 ID。攻击者可构造特定 UUID 来尝试与目标用户 ID 冲突（虽然需要使用一个新邮箱）。
- **影响**: 理论上可指定特定 userId 注册，潜在的 ID 碰撞风险。
- **修复建议**: 始终使用服务端生成的 `crypto.randomUUID()`，不接受客户端传入的 userId。

### M5. 静态文件路径无安全 Headers

- **位置**: `server/src/index.ts:48` — `app.use('/api/uploads', express.static(uploadsDir))`
- **描述**: 上传文件直接以原始 Content-Type 提供，无 CSP 或安全 headers。
- **影响**: 配合 SVG XSS 可窃取凭据。
- **修复建议**: 为上传目录设置安全 headers：
  ```typescript
  app.use('/api/uploads', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  }, express.static(uploadsDir));
  ```

---

## Low

### L1. 上传文件名未清理

- **位置**: `server/src/upload.ts` — `LocalUploadProvider.upload()`
- **描述**: 虽然使用了 UUID 重命名文件，但 `path.extname(filename)` 直接使用原始文件名的扩展名，理论上可注入路径字符。实际影响有限，因为 UUID 前缀保护了文件名主体。
- **影响**: 极低风险，但不符合最佳实践。
- **修复建议**: 对扩展名做白名单过滤。

### L2. 健康检查端点暴露服务器时间

- **位置**: `server/src/index.ts:51` — `/api/health`
- **描述**: 返回精确的服务器时间戳，可用于时间攻击的辅助信息。
- **影响**: 极低。
- **修复建议**: 可接受，不需要修改。

### L3. `.env.example` 中的 DATABASE_URL 包含示例密码

- **位置**: `.env.example:5`
- **描述**: `DATABASE_URL=postgresql://user:password@localhost:5432/openclaw` 中的 `password` 可能被开发者直接用于生产环境。
- **影响**: 如果开发者未修改默认凭据，数据库可被攻击。
- **修复建议**: 改为 `DATABASE_URL=postgresql://user:CHANGE_ME@localhost:5432/openclaw` 并加注释提醒。

---

## 未发现的问题（正面发现）

1. **SQL 注入**: 所有数据库查询使用参数化查询（`$1, $2`），未发现 SQL 注入风险。✅
2. **路由认证覆盖**: 除上传和健康检查外，所有业务路由均应用了 `authMiddleware`。✅（上传除外，见 H1）
3. **ownerId 数据隔离**: HTTP 路由层均正确使用 `req.userContext!.userId` 进行数据过滤。✅
4. **依赖安全**: 核心依赖（express, jsonwebtoken, pg, ws）均为最新稳定版本，无已知高危 CVE。✅
5. **WebSocket 分享模式**: 分享 token 的权限范围限制合理，正确校验了 instance/team 归属。✅

---

## 优先修复建议

1. **立即修复**: C1（JWT 默认密钥）、C2（WS 认证缺陷）、H1（上传无认证）
2. **尽快修复**: C3（ACCESS_TOKEN）、H2（SVG XSS）、H3（CORS）
3. **计划修复**: M1-M5 及其余 Low 级别问题
