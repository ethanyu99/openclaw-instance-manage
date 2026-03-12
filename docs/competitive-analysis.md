# 竞品分析报告

## Lobster Squad 定位

**多 OpenClaw 实例的 Web 管理 + 协作编排平台**。不是 Agent 框架本身，而是"Agent 框架之上的运维和协作层"。

## 竞品对比

### 1. CrewAI（Python，25k+ stars）
- **定位**：多 Agent 角色扮演编排框架
- **核心能力**：Crews（自治协作）+ Flows（事件驱动控制）
- **商业化**：Crew Control Plane（监控、追踪、部署）
- **优势**：100K+ 开发者社区、企业级 AMP 套件、丰富的文档
- **劣势**：Python-only、框架级绑定（不是运维层）、黑箱 Agent 内部

### 2. AG2 / AutoGen（Python，39k+ stars）
- **定位**：开源 AgentOS，多 Agent 对话框架
- **核心能力**：ConversableAgent、GroupChat、Swarm、NestedChat
- **优势**：学术背景强、设计模式丰富（sequential/group/nested）
- **劣势**：社区分裂（从微软 fork）、复杂度高

### 3. LangGraph（Python/JS，14k+ stars）
- **定位**：低级图编排框架，有状态 Agent 工作流
- **核心能力**：StateGraph、持久化执行、Human-in-the-loop
- **商业化**：LangSmith（可观测性）
- **优势**：低级灵活、持久化恢复、与 LangChain 生态集成
- **劣势**：学习曲线陡、抽象层较低

### 4. Pydantic AI（Python，17k+ stars）
- **定位**：类 FastAPI 的 GenAI Agent 框架
- **核心能力**：类型安全、多模型支持、Logfire 可观测性
- **优势**：Pydantic 团队背书、开发体验好
- **劣势**：偏单 Agent、协作能力弱

## Lobster Squad 的差异化

| 维度 | CrewAI / AG2 / LangGraph | Lobster Squad |
|------|--------------------------|---------------|
| 层级 | Agent 框架（代码级编排） | Agent 运维平台（WebUI 编排） |
| 目标用户 | 开发者写代码 | 运维者/产品经理通过 UI 操作 |
| Agent 实现 | 框架内置 Agent | 外部 OpenClaw 实例（已部署的 Agent） |
| 侵入性 | 需要用框架重写 Agent | 零侵入，对接已有 Gateway |
| 可视化 | 需要额外工具（LangSmith等） | 内置执行图谱/时间线/指标 |
| 沙箱 | 各自实现 | Novita Sandbox 一键创建 |
| 协作 | 代码定义 workflow | UI 定义团队 + Lead 自动规划 |

## 核心竞争力

1. **零侵入**：不改 OpenClaw Gateway，纯平台层编排
2. **Web-native**：非开发者也能用的团队协作 UI
3. **Lead-driven**：让 LLM（Lead Agent）做规划决策，平台只做执行
4. **可视化**：内置图谱、时间线、指标面板

## 需要补强的方向

1. **可观测性**：缺少 token 用量追踪、成本监控、性能指标
2. **持久化执行**：断线恢复、长时间任务的 checkpoint
3. **权限与审计**：操作日志、审计追踪不完善
4. **测试覆盖**：零测试文件
5. **CI/CD**：没有 GitHub Actions
6. **文档**：缺用户文档（只有 README）
7. **错误处理**：后端缺统一错误处理中间件
8. **前端架构**：组件过大（SkillsManagerDialog 790 行）、缺分层
