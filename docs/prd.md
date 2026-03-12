# Lobster Squad 产品优化 PRD

> **版本**：v1.0  
> **日期**：2026-03-12  
> **作者**：Product Manager (AI)  
> **产品定位**：OpenClaw 多实例管理与协作编排 Web 平台

---

## 一、产品现状分析

### 1.1 当前功能完成度

| 模块 | 状态 | 完成度 | 备注 |
|------|------|--------|------|
| 实例 CRUD + 健康检查 | ✅ 已完成 | 100% | WebSocket 实时状态同步 |
| 任务派发（单实例/批量） | ✅ 已完成 | 95% | 支持流式输出、图片附件、取消 |
| 团队模板 + 角色配置（Phase 1） | ✅ 已完成 | 100% | 预置模板 + 自定义角色 |
| 多实例协作引擎（Phase 2 核心） | ✅ 已完成 | 70% | 见下方 Gap 分析 |
| 执行可视化（图谱/时间线/指标） | ✅ 已完成 | 80% | 基础可视化完成，指标面板缺深度数据 |
| 技能系统 | ✅ 已完成 | 90% | 本地 + SkillsMP 远程市场 |
| 沙箱管理 | ✅ 已完成 | 85% | 创建/文件浏览/Git 配置 |
| 分享功能 | ✅ 已完成 | 100% | 带过期时间的只读链接 |
| 认证与数据隔离 | ✅ 已完成 | 100% | Google OAuth + JWT + ownerId |

### 1.2 Roadmap Gap 分析

对照 Phase 2 roadmap，以下关键能力**尚未实现**：

| Roadmap 计划 | 当前状态 | Gap 严重度 |
|-------------|---------|-----------|
| **双通道上下文传递**（Prompt + Git 共享工作空间） | ❌ 仅有 Prompt 注入，无 Git 共享仓库 | 🔴 高 |
| **TeamContext Store + Artifact 持久化** | ❌ 未实现结构化产出物提取 | 🔴 高 |
| **智能上下文裁剪**（依赖图 + contextNeeds + 体积控制） | ⚠️ 部分实现（context: full/summary/none），缺依赖图裁剪和体积控制 | 🟡 中 |
| **结构化执行计划**（JSON plan with dependencies） | ⚠️ 当前用 delegate/multi_delegate 逐步编排，非预先规划模式 | 🟡 中 |
| **SubTask 完整状态机**（pending→ready→dispatched→completed→needs_revision） | ⚠️ 简化为 pending/running/completed/failed | 🟡 中 |
| **共享白板视图** | ❌ 未实现 | 🟢 低 |
| **成果汇总页** | ❌ 未实现 | 🟢 低 |
| **人工介入执行** | ❌ 执行中无法插入用户指令 | 🟡 中 |

**关键发现**：当前协作引擎采用了**响应式编排**（Lead 逐步 delegate），而非 roadmap 设计的**预先规划模式**（Lead 输出完整 plan → 平台按依赖图执行）。响应式模式更灵活但缺乏全局视野，两种模式应共存。

### 1.3 用户体验痛点

1. **Token 用量不可见**：`ExecutionMetrics.tokenUsage` 始终为 `{ prompt: 0, completion: 0 }`，用户无法了解成本
2. **断线即丢失**：WebSocket 断开后执行进度丢失，无法恢复查看
3. **前端组件臃肿**：竞品分析指出 SkillsManagerDialog 达 790 行，维护困难
4. **无新手引导**：缺少用户文档、引导流程，新用户上手成本高
5. **执行中无法干预**：一旦派发团队任务，用户只能等待或取消，无法修正方向
6. **错误信息不友好**：后端缺统一错误处理中间件，前端错误提示粗糙
7. **无操作审计**：缺乏操作日志，无法追溯问题

---

## 二、竞品差异化策略

### 2.1 差异化定位

Lobster Squad 的核心竞争壁垒是 **"Agent 运维层"** 而非 "Agent 框架"：

```
CrewAI / LangGraph / AG2          Lobster Squad
─────────────────────          ──────────────────
  开发者写代码定义 Agent            运维者/PM 通过 WebUI 管理已有 Agent
  框架内置 Agent 实现              零侵入对接已部署的 OpenClaw 实例
  需要重写才能用                   即插即用
  可观测性需外部工具                内置图谱/时间线/指标
```

**一句话定位**：OpenClaw 生态的 "Kubernetes Dashboard" — 不替代 Agent，管理 Agent。

### 2.2 需要从竞品学习的功能点

| 竞品能力 | 来源 | 学习优先级 | 应用方式 |
|---------|------|-----------|---------|
| **LangSmith 级可观测性** | LangGraph | P0 | Token 追踪、成本监控、延迟分布、调用链追踪 |
| **持久化执行 + Checkpoint** | LangGraph | P0 | 断线恢复、长任务 checkpoint、执行回放 |
| **Human-in-the-loop** | LangGraph | P1 | 执行中人工审批/修正节点 |
| **Crew Control Plane** | CrewAI | P1 | 团队级仪表盘、成员健康度、利用率统计 |
| **Logfire 集成模式** | Pydantic AI | P2 | 统一日志/追踪格式，可对接外部 APM |
| **丰富的文档体系** | CrewAI | P1 | 快速入门、最佳实践、API 文档站 |

---

## 三、功能优化计划

### P0 — 必须做（直接影响核心价值）

#### F-01：Token 用量追踪与成本面板

- **描述**：从 OpenClaw Gateway 的 `response.completed` 事件中提取 `usage` 数据（prompt_tokens / completion_tokens），持久化到 Turn 和 Execution 级别，前端展示成本仪表盘
- **验收标准**：
  - 每个 Turn 记录实际 token 消耗
  - ExecutionMetrics 面板显示总 token、按角色分布、预估成本（可配置单价）
  - 支持按时间范围查看历史成本趋势
- **优先级**：P0
- **预估工作量**：5 人天

#### F-02：断线恢复与执行 Checkpoint

- **描述**：执行过程中每完成一个 Turn 自动持久化 checkpoint 到 PostgreSQL。WebSocket 重连后从最新 checkpoint 恢复执行状态和流式输出
- **验收标准**：
  - 浏览器刷新/断线重连后，自动恢复当前执行进度
  - 已完成的 Turn 输出可完整回看
  - 正在执行的 Turn 重连后继续接收流式输出
- **优先级**：P0
- **预估工作量**：8 人天

#### F-03：统一错误处理中间件

- **描述**：后端实现 Express 全局错误处理中间件，统一错误响应格式 `{ error: { code, message, details } }`；前端实现统一的 toast/notification 错误展示
- **验收标准**：
  - 所有 API 错误返回一致的 JSON 格式
  - 前端展示用户友好的错误信息（非原始错误堆栈）
  - 422 / 404 / 500 等场景均有合适处理
- **优先级**：P0
- **预估工作量**：3 人天

#### F-04：前端组件拆分

- **描述**：将超过 300 行的组件拆分为更小的子组件。重点：SkillsManagerDialog（790行）、ExecutionPanel、InstanceCard
- **验收标准**：
  - 单个组件文件不超过 300 行
  - 拆分后功能回归测试通过
  - 组件目录结构清晰（按功能分目录）
- **优先级**：P0
- **预估工作量**：5 人天

### P1 — 应该做（显著提升体验）

#### F-05：Human-in-the-loop（执行中人工介入）

- **描述**：在团队执行过程中，用户可以随时插入指令。平台将用户消息作为高优先级任务注入 Lead 的下一个 Turn，Lead 重新评估并调整计划
- **验收标准**：
  - 执行面板提供消息输入框
  - 用户消息作为 `[用户介入]` 前缀注入 Lead
  - Lead 收到后可调整后续委派
- **优先级**：P1
- **预估工作量**：5 人天

#### F-06：执行回放与调试

- **描述**：已完成的执行记录支持逐 Turn 回放，查看每个 Turn 的完整 prompt、输出、action 解析结果，辅助调试协作流程
- **验收标准**：
  - 执行详情页可逐步展开每个 Turn 的输入/输出
  - 显示 action 解析结果（成功/失败/回退）
  - 支持按时间线播放动画
- **优先级**：P1
- **预估工作量**：5 人天

#### F-07：用户引导与文档站

- **描述**：新增首次登录引导流程（创建实例 → 创建团队 → 派发任务）；搭建文档站（快速入门、概念说明、最佳实践、API 参考）
- **验收标准**：
  - 新用户首次登录看到引导 wizard（3-5 步）
  - 文档站至少包含：快速入门、团队协作指南、API 参考
  - 应用内关键功能有 tooltip 提示
- **优先级**：P1
- **预估工作量**：8 人天

#### F-08：团队仪表盘

- **描述**：团队级仪表盘展示：成员在线率、任务完成率、平均响应时间、token 消耗分布、最近执行概览
- **验收标准**：
  - 团队页面顶部展示关键统计指标
  - 支持按时间范围筛选（今日/7天/30天）
  - 成员级别的利用率可视化
- **优先级**：P1
- **预估工作量**：5 人天

#### F-09：操作审计日志

- **描述**：记录所有关键操作（实例增删改、任务派发、团队变更、执行启停）到审计表，支持按时间/类型/用户筛选
- **验收标准**：
  - 所有写操作自动记录审计日志
  - 管理界面可查看审计日志列表
  - 支持按操作类型和时间范围筛选
- **优先级**：P1
- **预估工作量**：4 人天

#### F-10：Git 共享工作空间

- **描述**：落地 roadmap 中的双通道上下文传递——为团队执行创建共享 Git 仓库，实例执行前自动 clone/pull，完成后 commit/push
- **验收标准**：
  - 团队可配置共享 Git 仓库地址
  - 执行时自动在实例沙箱中 clone/pull
  - 实例完成任务后自动 commit + push
  - 下游实例可读取上游的文件产出
- **优先级**：P1
- **预估工作量**：10 人天

### P2 — 可以做（锦上添花）

#### F-11：预先规划模式

- **描述**：支持 Lead 输出完整执行计划（JSON plan with dependencies），平台按依赖图并行/串行调度，与现有响应式模式共存
- **验收标准**：
  - Lead 可输出 `{ "action": "plan", "tasks": [...] }` 格式
  - 平台解析依赖图，自动并行无依赖的任务
  - 用户可在执行前预览/编辑计划
- **优先级**：P2
- **预估工作量**：12 人天

#### F-12：Artifact 结构化提取

- **描述**：实例完成任务后，平台调用 LLM 对输出做结构化提取（deliverable / summary / keyDecisions），存入 TeamContext
- **验收标准**：
  - 自动从 Turn 输出中提取结构化 Artifact
  - Artifact 可在执行详情中查看
  - 支持导出团队执行产出物
- **优先级**：P2
- **预估工作量**：6 人天

#### F-13：共享白板与成果汇总

- **描述**：实时展示 TeamContext 变化的共享白板视图；执行完成后生成统一成果汇总页
- **验收标准**：
  - 执行过程中实时更新白板内容
  - 执行完成后生成包含所有产出物的汇总页面
  - 支持导出 Markdown/PDF
- **优先级**：P2
- **预估工作量**：8 人天

#### F-14：外部 APM 集成

- **描述**：支持将追踪数据导出到 OpenTelemetry 兼容的 APM 系统（如 Grafana、Datadog）
- **验收标准**：
  - 可选开启 OTLP exporter
  - 执行 span 包含 Turn 级粒度
  - 文档说明集成方式
- **优先级**：P2
- **预估工作量**：5 人天

---

## 四、技术债清理

### 4.1 代码架构优化

| 问题 | 建议 | 优先级 |
|------|------|--------|
| 前端组件过大（SkillsManagerDialog 790 行） | 按功能拆分子组件，建立 `components/<Feature>/` 目录结构 | P0 |
| 后端无统一错误处理 | 添加 Express 全局 error handler 中间件 | P0 |
| `team-dispatch.ts` 过长（600+ 行） | 拆分为 `prompt-builder.ts`、`action-parser.ts`、`turn-executor.ts`、`graph-builder.ts` | P1 |
| Store 层职责不清 | 分离 `store.ts` 为 `instance-store.ts`、`team-store.ts`、`session-store.ts` | P1 |
| WebSocket 消息处理集中在 `ws.ts` | 抽取消息路由到 `ws-router.ts`，按消息类型分 handler | P2 |
| 共享类型 `types.ts` 过大 | 按领域拆分：`instance.types.ts`、`team.types.ts`、`execution.types.ts`、`skill.types.ts` | P2 |

### 4.2 测试策略

当前状态：**零测试文件**。需要分阶段建立测试体系：

| 层级 | 工具 | 覆盖目标 | 优先级 |
|------|------|---------|--------|
| **单元测试** | Vitest | action 解析器、prompt 构建器、上下文裁剪逻辑 | P0 |
| **API 集成测试** | Vitest + Supertest | 所有 REST API 路由 | P1 |
| **WebSocket 测试** | Vitest + ws mock | 任务派发、执行生命周期 | P1 |
| **前端组件测试** | Vitest + Testing Library | 关键交互组件（TaskInput、ExecutionPanel） | P1 |
| **E2E 测试** | Playwright | 核心用户流程（登录→创建实例→派发任务→查看结果） | P2 |

**目标覆盖率**：Sprint 3 结束时核心逻辑（action 解析、prompt 构建、状态机）达 80%。

### 4.3 CI/CD 流程设计

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Git Push    │────▸│  CI Pipeline │────▸│  Build      │────▸│  Deploy      │
│  / PR       │     │  (GitHub     │     │  + Test     │     │  (Railway)   │
└─────────────┘     │   Actions)   │     └─────────────┘     └──────────────┘
                    └──────────────┘
```

**Pipeline 阶段**：

1. **Lint & Type Check**：`eslint` + `tsc --noEmit`（PR gate）
2. **Unit Tests**：Vitest（PR gate，覆盖率不低于阈值）
3. **Build**：`npm run build`（确保编译通过）
4. **Integration Tests**：需 PostgreSQL + Redis 服务（CI matrix）
5. **Docker Build**：构建镜像并推送
6. **Deploy to Staging**：自动部署到 staging 环境
7. **Deploy to Production**：手动审批后部署到 production

**配置文件**：`.github/workflows/ci.yml`

---

## 五、里程碑规划

### Sprint 1（第 1-2 周）：基础加固

**主题**：错误处理、可观测性基础、测试框架搭建

| 任务 | 对应功能 | 工作量 |
|------|---------|--------|
| 统一错误处理中间件 | F-03 | 3d |
| Token 用量追踪（后端采集 + 数据持久化） | F-01 (后端) | 3d |
| 前端组件拆分（SkillsManagerDialog、ExecutionPanel） | F-04 (部分) | 3d |
| CI/CD 搭建（lint + type check + build） | 技术债 | 2d |
| Vitest 测试框架 + action 解析器单元测试 | 技术债 | 2d |
| team-dispatch.ts 模块拆分 | 技术债 | 2d |

**Sprint 1 交付物**：
- ✅ 所有 API 错误格式统一
- ✅ Turn 级 token 数据可持久化
- ✅ CI pipeline 可运行
- ✅ action 解析器测试覆盖率 > 90%
- ✅ 核心组件拆分完成

---

### Sprint 2（第 3-4 周）：核心体验提升

**主题**：成本面板、断线恢复、人工介入、文档

| 任务 | 对应功能 | 工作量 |
|------|---------|--------|
| Token 成本仪表盘（前端） | F-01 (前端) | 2d |
| 断线恢复与 checkpoint | F-02 | 8d |
| Human-in-the-loop 基础实现 | F-05 | 5d |
| 用户引导 wizard | F-07 (部分) | 3d |
| API 集成测试 | 技术债 | 2d |

**Sprint 2 交付物**：
- ✅ 成本面板可查看 token 消耗和预估费用
- ✅ 浏览器刷新后执行状态可恢复
- ✅ 执行中可发送消息干预 Lead
- ✅ 新用户引导流程上线
- ✅ 核心 API 测试覆盖

---

### Sprint 3（第 5-6 周）：差异化功能

**主题**：团队仪表盘、执行回放、审计日志、文档站

| 任务 | 对应功能 | 工作量 |
|------|---------|--------|
| 团队仪表盘 | F-08 | 5d |
| 执行回放与调试 | F-06 | 5d |
| 操作审计日志 | F-09 | 4d |
| 文档站搭建（快速入门 + 团队协作指南） | F-07 (完成) | 5d |
| 前端组件测试 | 技术债 | 2d |
| 剩余组件拆分 | F-04 (完成) | 2d |

**Sprint 3 交付物**：
- ✅ 团队仪表盘展示关键指标
- ✅ 执行记录可逐 Turn 回放调试
- ✅ 所有关键操作有审计日志
- ✅ 文档站上线
- ✅ 前端关键组件有测试

---

### 后续规划（Sprint 4+）

- Git 共享工作空间（F-10）
- 预先规划模式（F-11）
- Artifact 结构化提取（F-12）
- 共享白板与成果汇总（F-13）
- 外部 APM 集成（F-14）
- E2E 测试覆盖

---

## 附录：风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenClaw Gateway 不返回 token usage | F-01 无数据 | 先支持从 response.completed 事件提取；不可用时显示 "N/A" |
| 断线恢复方案复杂度超预期 | F-02 延期 | 先实现"刷新后恢复已完成进度"，再做"实时流恢复" |
| Git 共享工作空间依赖沙箱 SSH 能力 | F-10 受阻 | 优先验证 Novita Sandbox 的 Git 支持能力 |
| 零测试基础，团队不熟悉测试实践 | 测试目标不达标 | 从最关键的纯函数开始，降低门槛 |
