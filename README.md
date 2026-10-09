# react-synced-state

Share React state over WebSockets.

## Install

```sh
npx jsr add @9h/react-synced-state
```

## Server

```ts
// server.ts
import { server } from "jsr:@9h/react-synced-state/server";

server().start(8080);
```

```sh
deno run --allow-net server.ts
```

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
