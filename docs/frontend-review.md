# 前端代码审查报告

> 审查日期：2026-03-12
> 技术栈：React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + Zustand 5

---

## 1. 组件架构

### 1.1 超大组件需要拆分

| 组件 | 行数 | 优先级 |
|------|------|--------|
| `SkillsManagerDialog.tsx` | 790 | P0 |
| `ShareView.tsx` | 734 | P1 |
| `TaskInput.tsx` | 554 | P1 |
| `TeamCard.tsx` | 447 | P1 |
| `FileBrowserDialog.tsx` | 380 | P2 |
| `InstanceCard.tsx` | 370 | P2 |

#### P0: `SkillsManagerDialog.tsx`（790 行）

**问题**：集成了本地 skill 列表、远程搜索（SkillsMP）、skill 详情预览、安装/卸载逻辑、错误处理，全部在一个文件。

**拆分方案**：

```
components/skills/
├── SkillsManagerDialog.tsx     # 外壳 Dialog + tab 切换（~80 行）
├── LocalSkillsList.tsx          # 本地 skill 列表 + 安装/卸载
├── RemoteSkillSearch.tsx        # 远程搜索 + 结果列表
├── SkillDetailPanel.tsx         # Skill 详情/README 预览
├── SkillCategoryBadge.tsx       # 分类图标 + Badge（复用）
└── hooks/useSkillInstall.ts     # 安装/卸载逻辑 hook
```

#### P1: `ShareView.tsx`（734 行）

**问题**：集成了实例共享视图和 Team 共享视图，两个完全不同的 UI 都在一个组件里。

**拆分方案**：

```tsx
// ShareView.tsx — 路由分发（~30 行）
export function ShareView({ token }: { token: string }) {
  const { data, loading, error } = useShareData(token);
  if (loading) return <ShareSkeleton />;
  if (error) return <ShareError error={error} />;
  return data.shareType === 'team'
    ? <TeamShareView data={data} token={token} />
    : <InstanceShareView data={data} token={token} />;
}
```

#### P1: `TaskInput.tsx`（554 行）

**问题**：包含文件上传、图片预览、实例/团队选择器、快捷键处理、session 管理等多种职责。

**拆分方案**：

```
components/task-input/
├── TaskInput.tsx            # 主输入框 + 提交逻辑
├── TargetSelector.tsx       # 实例/团队选择下拉
├── ImageAttachments.tsx     # 图片上传 + 预览
└── hooks/useTaskSubmit.ts   # 提交逻辑 hook
```

### 1.2 `App.tsx` 评估（296 行）

**位置**：`client/src/App.tsx`

**问题**：`LoginPage` 组件内嵌在 App.tsx 中（约 60 行），应独立。`MainApp` 承载了所有 store 订阅和 UI 编排，尚可接受但有优化空间。

**改进方案**（P2）：

```tsx
// 将 LoginPage 移出为 components/LoginPage.tsx
// 将 tab 切换逻辑提取为 hooks/useViewTab.ts
```

### 1.3 组件复用评估

**问题**：多处重复使用相同的 loading spinner SVG（App.tsx 中至少出现 2 次）。

**改进方案**（P2）：

```tsx
// components/ui/Spinner.tsx
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin h-4 w-4", className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
```

---

## 2. 状态管理

### 2.1 Store 职责划分

| Store | 行数 | 职责 | 评估 |
|-------|------|------|------|
| `instanceStore` | 194 | 实例列表 + WS 消息处理 + 通知回调 | ⚠️ 混合了通知和 pending 状态 |
| `executionStore` | 386 | 执行日志 + WS 消息处理 | ⚠️ handleWSMessage 过长 |
| `wsStore` | 134 | WebSocket 连接 + 消息分发 | ✅ 合理 |
| `teamStore` | 21 | Team 列表 | ✅ 简洁 |

### 2.2 `executionStore.handleWSMessage` 过长（P1）

**位置**：`client/src/stores/executionStore.ts`，整个 `handleWSMessage` 约 250 行。

**问题**：巨型 switch-case，每个 case 内有深度嵌套的 `set()` 调用，可读性差。

**改进方案**：

```tsx
// 将每个 case 提取为独立函数
function handleTurnStart(msg: WSMessage, prev: ExecutionState): Partial<ExecutionState> { ... }
function handleTurnStream(msg: WSMessage, prev: ExecutionState): Partial<ExecutionState> { ... }

// handleWSMessage 变为路由表
const handlers: Record<string, Handler> = {
  'execution:started': handleStarted,
  'execution:turn_start': handleTurnStart,
  'execution:turn_stream': handleTurnStream,
  // ...
};

handleWSMessage: (msg) => {
  const handler = handlers[msg.type];
  if (handler) set(prev => handler(msg, prev));
}
```

### 2.3 `instanceStore` 职责不清（P1）

**位置**：`client/src/stores/instanceStore.ts`

**问题**：
- `_notifyFn`、`_taskContentRef`、`_pendingExchanges` 这些以 `_` 开头的字段混在 state interface 里，暗示它们不应暴露给组件
- `_taskContentRef` 是可变引用，放在 Zustand state 里语义不清

**改进方案**：

```tsx
// 将通知逻辑提取到 hooks/useNotification.ts（已存在）
// 将 _taskContentRef 和 _pendingExchanges 改为模块级变量
const taskContentRef: Record<string, string> = {};
const pendingExchanges: Record<string, PendingExchange> = {};

// 不放入 Zustand state
```

### 2.4 不必要的 re-render（P1）

**位置**：`client/src/App.tsx` `MainApp` 组件

**问题**：`MainApp` 订阅了 9 个 store selector。虽然 Zustand 的 selector 能防止无关更新，但 `taskStreams`（高频 streaming 数据）会导致频繁 re-render。

**改进方案**：

```tsx
// 不在 MainApp 订阅 taskStreams，改在 InstanceCard 内部订阅
function InstanceCard({ instance }: Props) {
  const taskStream = useInstanceStore(s => s.taskStreams[instance.id]);
  // ...
}
```

实际代码中 `taskStreams` 已作为 prop 传递给 `InstanceCard`，这会导致 MainApp 在每次 stream chunk 时 re-render 所有子组件。改为子组件自行订阅可显著降低 re-render 范围。

### 2.5 WebSocket 状态管理（P2）

**位置**：`client/src/stores/wsStore.ts`

**评估**：整体设计合理——单一连接、自动重连、消息路由清晰。

**小问题**：
- 重连没有指数退避（固定 3s）
- 没有最大重连次数限制
- `_ws` 和 `_reconnectTimer` 存放在 Zustand state 中，虽然以 `_` 标记但仍会触发 subscriber 通知

**改进方案**：

```tsx
// 指数退避
let retryCount = 0;
const delay = Math.min(1000 * 2 ** retryCount, 30000);
retryCount++;

// 将 _ws 和 _reconnectTimer 改为模块级变量
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
```

---

## 3. API 层

### 3.1 `api.ts` 过于庞大（742 行）（P1）

**位置**：`client/src/lib/api.ts`

**问题**：所有 API 调用集中在一个文件，包括 instances、teams、share、sessions、executions、skills、auth、sandbox files 等 8+ 个领域。

**改进方案**：

```
lib/api/
├── index.ts         # re-export all
├── client.ts        # authHeaders, fetch wrapper
├── instances.ts     # instance CRUD
├── teams.ts         # team + role CRUD
├── executions.ts    # execution API
├── sessions.ts      # session API
├── share.ts         # share link API
├── skills.ts        # local + remote skills
├── sandbox.ts       # sandbox files + config
└── auth.ts          # auth API
```

### 3.2 缺少统一错误处理（P0）

**位置**：`client/src/lib/api.ts` 全局

**问题**：每个 API 函数都有重复的错误处理模式：

```tsx
if (!res.ok) {
  const body = await res.json().catch(() => ({ error: 'Failed to ...' }));
  throw new Error(body.error || 'Failed to ...');
}
```

这段代码在文件中出现了 **30+ 次**。

**改进方案**：

```tsx
// lib/api/client.ts
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string>),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new ApiError(body.error || `Request failed: ${res.status}`, res.status, body.code);
    throw error;
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) return res.json();
  return res.text() as unknown as T;
}

// 使用
export const fetchInstances = () => apiFetch<{ instances: InstancePublic[] }>('/instances');
export const deleteInstance = (id: string) => apiFetch<void>(`/instances/${id}`, { method: 'DELETE' });
```

### 3.3 没有使用 React Query / SWR（P1）

**问题**：所有数据获取都是手动 `useEffect` + state 管理，没有：
- 自动缓存
- 自动 refetch（窗口聚焦、网络恢复）
- loading / error 状态自动管理
- 乐观更新
- 请求去重

**改进方案**：引入 `@tanstack/react-query`

```tsx
// hooks/useInstances.ts
export function useInstances() {
  return useQuery({
    queryKey: ['instances'],
    queryFn: fetchInstances,
    refetchOnWindowFocus: true,
  });
}

// 组件中使用
function MainApp() {
  const { data, isLoading, error } = useInstances();
  // 自动处理 loading / error / 缓存
}
```

**注意**：现有 WebSocket 实时更新机制需要与 React Query 配合——WS 消息可以通过 `queryClient.setQueryData` 直接更新缓存，而不是维护独立的 Zustand store。

### 3.4 请求状态管理缺失（P1）

**位置**：各组件内部

**问题**：多数组件自行管理 `loading` / `error` 状态，无统一模式。部分 API 调用甚至没有 loading 状态处理（如 `teamStore.loadTeams`、`instanceStore.loadInstances` 静默失败）。

---

## 4. UX 问题

### 4.1 空状态处理（P2）

**评估**：✅ 已处理——`MainApp` 对 instances 和 teams 的空列表都有友好的空状态 UI（图标 + 文案 + 操作引导）。

### 4.2 加载状态（P1）

**位置**：`client/src/App.tsx` `MainApp`

**问题**：`MainApp` 首次加载时没有 loading 状态。`loadInstances` 和 `loadTeams` 是异步调用，但组件直接渲染空列表 → 空状态 UI → 数据加载完成后切换为列表，造成闪烁。

**改进方案**：

```tsx
// 在 store 中添加 loading 状态
interface InstanceState {
  loading: boolean;
  // ...
}

// 或使用 React Query 自动管理
```

### 4.3 错误提示（P1）

**问题**：大部分 API 错误通过 `console.warn` 静默处理（`instanceStore`、`teamStore`、`executionStore` 中 catch 块均如此），用户看不到任何反馈。

**改进方案**：

```tsx
// 引入 toast 通知（shadcn/ui 已有 sonner/toast 组件）
import { toast } from 'sonner';

loadInstances: async () => {
  try {
    const data = await fetchInstances();
    set(setInstancesAndStats(data.instances));
  } catch (err) {
    toast.error('Failed to load instances');
  }
}
```

### 4.4 移动端适配（P2）

**位置**：`MainApp` grid 布局

**评估**：基本可用——使用了 `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` 响应式布局。

**问题**：
- `px-8` 在小屏幕上内边距过大
- Tab 切换栏没有响应式处理
- `TaskInput` 底部固定输入框在移动端可能被键盘遮挡

**改进方案**（P2）：

```tsx
// px-8 → px-4 sm:px-8
// TaskInput 添加 safe-area-inset-bottom
<div className="pb-[env(safe-area-inset-bottom)]">
  <TaskInput ... />
</div>
```

### 4.5 暗色模式（P2）

**评估**：❌ 基本未支持。

**问题**：
- 没有找到 `tailwind.config` 中的 `darkMode` 配置（使用 Tailwind v4，需要通过 CSS 配置）
- 全局背景硬编码为 `bg-[#f8f9fa]`
- 只有 `ExecutionReportDialog` 和 `HistoryDrawer` 中有零星的 `dark:` 类
- 大部分组件没有暗色模式变体

**改进方案**：
1. 在 CSS 中配置 Tailwind v4 暗色模式（`@custom-variant dark (&:where(.dark, .dark *))` 或 media query）
2. 将 `bg-[#f8f9fa]` 替换为 `bg-background`（shadcn/ui 的 CSS 变量已支持暗色）
3. 逐步为所有硬编码颜色添加 `dark:` 变体

---

## 5. 性能

### 5.1 没有代码分割（P1）

**位置**：`client/src/App.tsx`

**问题**：所有组件同步 import，没有使用 `React.lazy` / `Suspense`。`SkillsManagerDialog`（790 行）、`ShareView`（734 行）、`FileBrowserDialog`（380 行）等低频组件全部打入主 bundle。

**改进方案**：

```tsx
import { lazy, Suspense } from 'react';

const ShareView = lazy(() => import('@/components/ShareView'));
const SkillsManagerDialog = lazy(() => import('@/components/SkillsManagerDialog'));
const ExecutionReportDialog = lazy(() => import('@/components/ExecutionReportDialog'));
const HistoryDrawer = lazy(() => import('@/components/HistoryDrawer'));

// 使用时
<Suspense fallback={<Spinner />}>
  <ShareView token={shareToken} />
</Suspense>
```

### 5.2 大列表没有虚拟滚动（P2）

**评估**：目前实例列表和团队列表数量可能较少，暂无需虚拟滚动。但 `HistoryDrawer`（执行历史）和 `SkillsManagerDialog`（skill 列表）可能有大量条目。

**改进方案**：当列表 > 50 条时考虑引入 `@tanstack/react-virtual`。

### 5.3 Bundle 大小（P2）

**问题**：
- `react-markdown` + `remark-gfm` 体积较大（~100KB gzipped）
- `lucide-react` 导入了大量图标（仅 `SkillsManagerDialog` 就导入了 18 个图标）
- 没有 Vite `rollupOptions.output.manualChunks` 配置

**改进方案**：

```tsx
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'markdown': ['react-markdown', 'remark-gfm'],
          'ui': ['radix-ui', 'class-variance-authority', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
});
```

### 5.4 高频 streaming 导致过度渲染（P0）

**位置**：`instanceStore` `task:stream` + `executionStore` `execution:turn_stream`

**问题**：每个 WebSocket stream chunk（可能每秒数十次）都会触发 Zustand `set()`，导致所有订阅 `taskStreams` 或 `executionStreams` 的组件 re-render。

**改进方案**：

```tsx
// 方案 1：节流更新（推荐）
import { throttle } from 'lodash-es'; // 或手写

let streamBuffer: Record<string, string> = {};
const flushStreams = throttle(() => {
  set(prev => ({
    taskStreams: { ...prev.taskStreams, ...streamBuffer },
  }));
  streamBuffer = {};
}, 100); // 每 100ms 刷新一次

// 方案 2：使用 ref 存储 stream 内容，不触发 re-render
// 通过 requestAnimationFrame 更新 DOM
```

---

## 优先级汇总

### P0（必须尽快修复）
| # | 问题 | 位置 |
|---|------|------|
| 1 | 缺少统一 API 错误处理，30+ 处重复代码 | `lib/api.ts` |
| 2 | 高频 streaming 导致全局过度渲染 | `instanceStore` / `executionStore` |
| 3 | `SkillsManagerDialog` 790 行巨型组件 | `components/SkillsManagerDialog.tsx` |

### P1（短期内应处理）
| # | 问题 | 位置 |
|---|------|------|
| 4 | `api.ts` 742 行应按领域拆分 | `lib/api.ts` |
| 5 | 没有使用 React Query，手动管理请求状态 | 全局 |
| 6 | `executionStore.handleWSMessage` 250 行 switch | `stores/executionStore.ts` |
| 7 | `instanceStore` 混入通知和可变引用 | `stores/instanceStore.ts` |
| 8 | API 错误静默 `console.warn`，用户无反馈 | stores 全局 |
| 9 | 没有代码分割 | `App.tsx` |
| 10 | 首次加载无 loading 状态（闪烁） | `App.tsx` MainApp |
| 11 | `ShareView` 734 行 / `TaskInput` 554 行需拆分 | components |
| 12 | `taskStreams` 通过 prop 传递导致 MainApp 频繁 re-render | `App.tsx` |

### P2（可规划迭代）
| # | 问题 | 位置 |
|---|------|------|
| 13 | 暗色模式基本未支持 | 全局 |
| 14 | 移动端内边距和键盘适配 | `App.tsx` / `TaskInput` |
| 15 | Bundle 拆分和体积优化 | `vite.config.ts` |
| 16 | 重复的 loading spinner 未提取 | `App.tsx` |
| 17 | WebSocket 重连无指数退避 | `wsStore.ts` |
| 18 | 大列表未来可能需要虚拟滚动 | `HistoryDrawer` / `SkillsManagerDialog` |
| 19 | `LoginPage` 内嵌在 App.tsx | `App.tsx` |
| 20 | 中等组件（370-450 行）可考虑拆分 | `InstanceCard` / `TeamCard` / `FileBrowserDialog` |
