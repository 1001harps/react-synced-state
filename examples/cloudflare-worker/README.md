# Cloudflare Worker example

A deployable sync server built with `@9h/react-synced-state/cloudflare`.

## Deploy

```sh
npm install
npx wrangler login
npx wrangler deploy
```

Use the printed `wss://` URL as the hook's `url`.

## Develop locally

```sh
npx wrangler dev
```

The hooks connect to `ws://127.0.0.1:8787`.

## Configuration

`wrangler.jsonc` binds the `SYNC_ROOMS` Durable Object. Empty rooms expire
after 30 minutes; set `ROOM_TTL_MS` to override.

> [!WARNING]
> No built-in access control. Anyone with the URL and a room ID can read and
> modify that room.
