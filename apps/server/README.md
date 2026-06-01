# Production Spec Graph Sync Server

`@production-spec-graph/server` is the dedicated Node backend for local
tldraw collaboration. It is a standalone app under `apps/`, separate from
`apps/web`.

## Commands

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
pnpm --filter @production-spec-graph/server smoke
```

## Local Endpoints

Default host and port:

```text
http://127.0.0.1:3001
```

Health and readiness:

```text
GET /health
GET /ready
```

Sync websocket route:

```text
ws://127.0.0.1:3001/sync/:roomId?sessionId=:sessionId
```

Room ids are intentionally restricted to letters, numbers, `.`, `_`, and `-`.
Session ids are opaque tab/session identifiers and may also contain `:`.

## Configuration

Environment variables:

```text
HOST=127.0.0.1
PORT=3001
SYNC_ROUTE=/sync
ALLOWED_ORIGINS=http://127.0.0.1:3000,http://127.0.0.1:3100,http://localhost:3000,http://localhost:3100
```

Browser websocket requests must use an exact allowed origin. Requests without
an `Origin` header are accepted so local smoke clients can test the raw socket.

## Tldraw Sync Compatibility

This sprint uses `@tldraw/sync-core@5.0.1`, `TLSocketRoom`, and explicit
`InMemorySyncStorage`. The backend registry creates one live room and one
in-memory storage instance per room id inside the running Node process.

That means room state is not durable:

- restarting the backend clears rooms
- running multiple backend processes splits room state
- this is not production persistence

`apps/web` now connects to this backend with `@tldraw/sync@5.0.1`.
The web client creates canonical room routes at `/rooms/:roomId`, validates
route room ids before connecting, and requires
`NEXT_PUBLIC_PSG_SYNC_SERVER_URL=http://127.0.0.1:3001` in local development.

The backend remains intentionally process-local and non-durable; restarting this
service clears in-memory rooms and clients surface reconnect/reset expectations.
