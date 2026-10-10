# react-synced-state

Share React state over WebSockets.

## Install

```sh
npx jsr add @9h/react-synced-state
```

## Server

### Deno

```ts
// server.ts
import { server } from "jsr:@9h/react-synced-state/server";

server().start(8080);
```

```sh
deno run --allow-net server.ts
```

### Cloudflare Workers

```ts
// src/index.ts
export { SyncedRoom } from "@9h/react-synced-state/cloudflare";
export { worker as default } from "@9h/react-synced-state/cloudflare";
```

```jsonc
// wrangler.jsonc
{
  "name": "my-sync-server",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-09",
  "durable_objects": {
    "bindings": [{ "name": "SYNC_ROOMS", "class_name": "SyncedRoom" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["SyncedRoom"] }]
}
```

```sh
npm install
npx wrangler dev     # ws://localhost:8787
npx wrangler login
npx wrangler deploy  # prints the wss:// URL
```

Full example: [`examples/cloudflare-worker`](./examples/cloudflare-worker).
Empty rooms expire after 30 minutes; `ROOM_TTL_MS` overrides.

> [!WARNING]
> No built-in access control. Anyone with the URL and a room ID can read and
> modify that room.

Every accepted update broadcasts and persists the full state, so this fits
modest update rates and state sizes.

## React

```tsx
import { useSyncedStateReducer } from "@9h/react-synced-state/hooks";

const reducer = (state: { count: number }, action: { type: "increment" }) => {
  if (action.type === "increment") return { count: state.count + 1 };
  return state;
};

export const Counter = ({ roomId }: { roomId: string }) => {
  const [state, dispatch, connection] = useSyncedStateReducer(
    {
      url: "ws://localhost:8080",
      roomId,
      initialState: { count: 0 },
      metadata: { name: "Agnes" },
    },
    reducer,
  );

  return (
    <button onClick={() => dispatch({ type: "increment" })}>
      {state.count} ({connection.status})
    </button>
  );
};
```

Clients using the same `roomId` share state. State and metadata must be
JSON-serializable.

The hook returns `[state, dispatch, connection]`. `connection` provides
`status`, `error`, `connectionId`, and the current room `members`.

`useSyncedState` is also available when you want a state setter instead of a
reducer:

```ts
const [state, setState, connection] = useSyncedState(config);
```
