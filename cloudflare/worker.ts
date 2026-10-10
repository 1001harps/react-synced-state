/// <reference types="npm:@cloudflare/workers-types@^5.20261009.1" />
import type { SyncedRoom } from "./SyncedRoom.ts";

/** Bindings expected by the ready-to-use Worker. */
export interface WorkerEnv {
  /** Durable Object namespace that stores rooms, bound as `SYNC_ROOMS`. */
  SYNC_ROOMS: DurableObjectNamespace<SyncedRoom>;
  /** Room time-to-live in milliseconds, as a string. Defaults to 30 minutes. */
  ROOM_TTL_MS?: string;
}

/**
 * Ready-to-use Worker that routes WebSocket connections to room Durable
 * Objects and answers health checks.
 */
export const worker: ExportedHandler<WorkerEnv> = {
  fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("This endpoint expects a WebSocket", { status: 426 });
    }

    const roomId = url.searchParams.get("roomId");
    if (!roomId) return new Response("Missing roomId", { status: 400 });

    return env.SYNC_ROOMS.getByName(roomId).fetch(request);
  },
};
