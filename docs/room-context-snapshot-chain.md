# `/rooms/:roomId/context/snapshot` 链路说明

这条链路不是 tldraw 协同同步本身，而是给 AI coworker 准备的“房间上下文 feed”。tldraw 文档仍然通过 `/sync/:roomId` WebSocket 同步；`/rooms/:roomId/context/snapshot` 只是 web 从已挂载的 tldraw editor 里提取一份紧凑、AI 可读的事实摘要，然后 POST 给 server。

## 结论

- 当前会在 tldraw editor 挂载时自动发布一次初始 snapshot。
- 当前不会自动监听每一次画布编辑并持续发布 snapshot。
- raw Mate 面板每次发送消息前会主动再发布一次最新 snapshot。
- `canvas-change`、`selection-change`、`viewport-change`、`chat-boundary` event 通过 `window.__PSG_ROOM_CONTEXT__` runtime 手动发送；现有 E2E 和 raw Mate 面板会用这个 runtime。
- server 只保存每个 room 的最新一份 snapshot 和有界 recent events，不做持久化。
- “发给 AI”目前是 server 把 `RoomContextFeed` 传给 `apps/mate` 的确定性 `prepareMateTurn` 边界；当前没有真实 LLM 调用。

## 入口和发布时机

1. 用户打开 `/rooms/:roomId`。
2. `apps/web/app/rooms/[roomId]/page.tsx` 校验 room id，合法后渲染 `CanvasShell`。
3. `CanvasShell` 创建 device/session/tab 身份，并用 `useSync` 连接 `ws://.../sync/:roomId`。
4. tldraw `<Tldraw onMount>` 触发 `registerMountedRoomContext(...)`。
5. `registerMountedRoomContext` 调用 `registerRoomContextRuntime(editor, ...)`。
6. `registerRoomContextRuntime` 把 `window.__PSG_ROOM_CONTEXT__` 注册到浏览器，并立即执行一次 `api.publishSnapshot()`。
7. raw Mate 面板发送消息时，按顺序执行：
   - `window.__PSG_ROOM_CONTEXT__?.publishSnapshot()`
   - `window.__PSG_ROOM_CONTEXT__?.emitChatBoundary(trimmed)`
   - `client.sendMessage(trimmed)`，即 POST `/rooms/:roomId/mate/messages`

所以答案是：不是只在“一开始创建画布”时收集。它在 editor 挂载时自动收集一次，并在每次 raw Mate 发送消息前再收集一次。但除了这些入口，当前没有自动绑定 tldraw change listener 去连续收集。

## Snapshot 内容

`extractCanvasSnapshotFromEditor` 只读取一个窄 editor adapter：

- `getCurrentPageShapes()`：当前页面 shape 列表
- `getSelectedShapeIds()`：当前 selection
- `getShapePageBounds()`：可选 shape bounds
- `getViewportPageBounds()`：当前 viewport bounds
- `getZoomLevel()`：可选 zoom

生成的 payload 由 `packages/shared/src/index.ts` 的 `canvasSnapshotSchema` 校验，核心结构是：

```json
{
  "schemaVersion": "canvas-context.v1",
  "roomId": "alpha",
  "source": {
    "kind": "web",
    "deviceId": "...",
    "sessionId": "...",
    "tabId": "...",
    "capturedAt": "..."
  },
  "document": {
    "shapeCount": 1,
    "shapes": [
      {
        "id": "shape:one",
        "type": "text",
        "text": "Hello",
        "bounds": { "x": 10, "y": 20, "w": 120, "h": 40 }
      }
    ]
  },
  "selection": {
    "selectedShapeIds": ["shape:one"]
  },
  "viewport": {
    "pageBounds": { "x": 0, "y": 0, "w": 800, "h": 600 },
    "zoom": 1
  },
  "freshness": {
    "snapshotVersion": 1,
    "eventVersionAtSnapshot": 0
  }
}
```

这不是完整 tldraw document dump。它只保留 AI 推理当前需要的事实：shape id/type/text/bounds、selection、viewport 和 freshness counters。

## Server 如何存储

`POST /rooms/:roomId/context/snapshot` 在 `apps/server/src/http/app.ts` 中处理：

1. `ensureRoomForContext` 校验或创建 room runtime。
2. `contextStore.acceptSnapshot(room.roomId, request.body, agentContext)` 接收 payload。
3. `acceptSnapshot` 用 `canvasSnapshotSchema.safeParse` 校验 payload。
4. 如果 payload 的 `roomId` 和路由 room id 不一致，返回 `ROOM_MISMATCH`，不更新 store。
5. 成功后写入 process-local `Map<string, MutableRoomContext>`：
   - `latestSnapshot = parsed.data`
   - `recentEvents` 保留原样
   - `eventVersion` 不因 snapshot 自己增加
6. 返回 `buildFeed(...)` 生成的 `RoomContextFeed`。

store 是内存态：

- 每个 server 进程一份 `Map`
- 每个 room 只保存最新 snapshot
- recent events 默认最多 50 条
- 重启 server 会清空
- 多进程不会共享

这和 tldraw sync 的 `InMemorySyncStorage` 是两条内存状态：sync storage 保存协同编辑状态；context store 保存 AI 输入摘要。

## Event 和 Freshness

operation events 通过 `POST /rooms/:roomId/context/events` 进入同一个 context store，包括：

- `canvas-change`
- `selection-change`
- `viewport-change`
- `chat-boundary`

server 保存 event 时会更新：

```ts
context.eventVersion = Math.max(context.eventVersion, parsed.data.eventVersion)
context.recentEvents = [...context.recentEvents, parsed.data].slice(-eventLimit)
```

`buildFeed` 生成 freshness：

```ts
changedSinceSnapshot = eventVersion > eventVersionAtSnapshot
```

注意当前 raw Mate 发送顺序是先 snapshot、再 chat-boundary、再 mate message。因此这次 chat-boundary 会让 `eventVersion` 大于 snapshot 捕获时的 `eventVersionAtSnapshot`。结果是 mate turn 会看到 `changedSinceSnapshot: true`，并把这次响应标记为基于可能过期的 snapshot。这是当前实现的真实行为，不是文档推断。

## 怎么发给 AI

用户点击 raw Mate 的 Send 后：

1. web 先 POST 最新 snapshot。
2. web 再 POST 一条 `chat-boundary` event。这里不保存聊天正文，只保存 `messageLength`。
3. web POST `/rooms/:roomId/mate/messages`，body 才包含完整 `message` 和 web source。
4. server 的 mate messages route 调用：

```ts
mateService.handleMessage({
  roomId,
  payload: request.body,
  context: contextStore.getFeed(roomId, agentContext),
  agent
})
```

5. `RoomMateService` 校验 message、校验 context room id，然后调用：

```ts
prepareMateTurn({
  roomId,
  userMessage: parsed.data.message,
  context
})
```

6. `apps/mate/src/context/mate-turn.ts` 当前做确定性处理：
   - `observeRoom` 从 `latestSnapshot` 和 `recentEvents` 提取事实观察
   - `inferIntent` 根据用户消息、近期 event、selection、画布文本推断轻量 intent
   - `chooseOutput` 生成 suggestion、question 或 canvas-action-proposal
   - `memoryStore.recordTurn` 记录有界、process-local 的 turn 摘要
   - `mateTurnResultSchema.parse` 校验输出
7. server 再用 `agentOutputSchema` 校验 mate output。
8. 如果 output 是 canvas action proposal，server 只返回 `pending`/`blocked` 诊断，`applied` 永远是 `false`，不会改画布。
9. web raw Mate 面板把返回 JSON 直接渲染出来。

## 当前限制

- 没有真实 LLM/model 调用。
- 没有自动从 server 读取 tldraw sync storage 来生成 snapshot；snapshot 由 web editor 主动发布。
- 没有自动持续监听所有 tldraw mutation。
- context store 和 mate memory 都不持久化。
- chat-boundary 当前会影响 `changedSinceSnapshot`，所以“刚发送消息”也会让 mate 认为 snapshot 后已有新事件。
- proposal 只是一段数据，不会自动应用到 tldraw。
