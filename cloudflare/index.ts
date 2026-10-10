/**
 * Cloudflare Workers and Durable Objects sync server.
 *
 * Deploy the ready-to-use Worker together with the {@link SyncedRoom} Durable
 * Object and point the React hooks at the resulting `wss://` URL. The Worker
 * expects a Durable Object binding named `SYNC_ROOMS`.
 *
 * @module
 */
export { SyncedRoom } from "./SyncedRoom.ts";
export { worker } from "./worker.ts";
export { worker as default } from "./worker.ts";
export type { WorkerEnv } from "./worker.ts";
