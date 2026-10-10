/// <reference types="npm:@cloudflare/workers-types@^5.20261009.1" />
import { DurableObject } from "cloudflare:workers";
import { applyPatch, Operation } from "npm:fast-json-patch@^3.1.1/index.mjs";
import type { JsonValue, ServerEvent } from "../common/index.ts";
import {
  DEFAULT_ROOM_TTL_MS,
  isClientMessage,
} from "../common/validation.ts";

const ROOM_STORAGE_KEY = "room";

interface StoredRoom {
  state: JsonValue;
  revision: number;
}

interface ConnectionAttachment {
  connectionId: string;
  metadata: JsonValue;
  initialized: boolean;
}

interface SyncedRoomEnv {
  /** Room time-to-live in milliseconds, as a string. Defaults to 30 minutes. */
  ROOM_TTL_MS?: string;
}

const parseRoomTtlMs = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOM_TTL_MS;
};

/**
 * Durable Object holding the state for a single room.
 *
 * Connections are accepted through the WebSocket Hibernation API so a room
 * can hibernate without dropping its clients. The canonical state and
 * revision live in Durable Object storage, while each connection keeps its
 * ID, metadata, and initialization status in a serialized attachment.
 */
export class SyncedRoom extends DurableObject<SyncedRoomEnv> {
  private readonly roomTtlMs: number;

  constructor(ctx: DurableObjectState, env: SyncedRoomEnv) {
    super(ctx, env);
    this.roomTtlMs = parseRoomTtlMs(env.ROOM_TTL_MS);
  }

  override fetch(_request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const attachment: ConnectionAttachment = {
      connectionId: crypto.randomUUID(),
      metadata: null,
      initialized: false,
    };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = this.attachment(ws);

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(message));
    } catch {
      this.send(ws, { type: "error", message: "Unable to read client message" });
      return;
    }

    if (!isClientMessage(parsed)) {
      this.send(ws, { type: "error", message: "Invalid client message" });
      return;
    }

    if (parsed.type === "initialize") {
      if (attachment?.initialized) {
        this.send(ws, { type: "error", message: "Already initialized" });
        return;
      }
      await this.join(ws, attachment, parsed.initialState, parsed.metadata);
      return;
    }

    if (!attachment?.initialized) {
      this.send(ws, {
        type: "error",
        message: "Initialize before updating state",
      });
      return;
    }

    await this.applyClientPatch(ws, attachment, parsed.patch);
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // The connection may already be closed.
    }
    await this.leave(ws);
  }

  override async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.leave(ws);
  }

  override async alarm(): Promise<void> {
    if (this.initializedMembers().length > 0) return;
    await this.ctx.storage.delete(ROOM_STORAGE_KEY);
  }

  private async join(
    ws: WebSocket,
    storedAttachment: ConnectionAttachment | null,
    initialState: JsonValue,
    metadata: JsonValue,
  ): Promise<void> {
    const attachment: ConnectionAttachment = storedAttachment ?? {
      connectionId: crypto.randomUUID(),
      metadata: null,
      initialized: false,
    };

    let room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
    if (!room) {
      room = { state: initialState, revision: 0 };
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
    }

    // A member is present again, so the room must not expire.
    await this.ctx.storage.deleteAlarm();

    attachment.metadata = metadata;
    attachment.initialized = true;
    ws.serializeAttachment(attachment);

    const members = this.initializedMembers();
    this.send(ws, {
      type: "initial_state",
      state: room.state,
      revision: room.revision,
      connectionId: attachment.connectionId,
      members: members.map((member) => ({
        connectionId: member.attachment.connectionId,
        metadata: member.attachment.metadata,
      })),
    });

    for (const member of members) {
      if (member.socket === ws) continue;
      this.send(member.socket, {
        type: "joined",
        connectionId: attachment.connectionId,
        metadata,
      });
    }
  }

  private async applyClientPatch(
    ws: WebSocket,
    attachment: ConnectionAttachment,
    patch: Operation[],
  ): Promise<void> {
    const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
    if (!room) {
      this.send(ws, { type: "error", message: "Room no longer exists" });
      return;
    }

    let updated: StoredRoom;
    try {
      const result = applyPatch(room.state, patch, true, false);
      updated = {
        state: result.newDocument as JsonValue,
        revision: room.revision + 1,
      };
      await this.ctx.storage.put(ROOM_STORAGE_KEY, updated);
    } catch {
      this.send(ws, {
        type: "error",
        message: "Unable to apply state patch",
      });
      this.send(ws, {
        type: "state",
        state: room.state,
        revision: room.revision,
        originConnectionId: attachment.connectionId,
        metadata: attachment.metadata,
      });
      return;
    }

    this.broadcast({
      type: "state",
      state: updated.state,
      revision: updated.revision,
      originConnectionId: attachment.connectionId,
      metadata: attachment.metadata,
    });
  }

  private async leave(ws: WebSocket): Promise<void> {
    const attachment = this.attachment(ws);
    if (!attachment?.initialized) return;

    attachment.initialized = false;
    ws.serializeAttachment(attachment);

    this.broadcast({
      type: "left",
      connectionId: attachment.connectionId,
      metadata: attachment.metadata,
    }, ws);

    if (this.initializedMembers().length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + this.roomTtlMs);
    }
  }

  private attachment(ws: WebSocket): ConnectionAttachment | null {
    return ws.deserializeAttachment() as ConnectionAttachment | null;
  }

  private initializedMembers(): Array<{
    socket: WebSocket;
    attachment: ConnectionAttachment;
  }> {
    const members = [];
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (attachment?.initialized) members.push({ socket, attachment });
    }
    return members;
  }

  private broadcast(event: ServerEvent, except?: WebSocket): void {
    for (const member of this.initializedMembers()) {
      if (member.socket === except) continue;
      this.send(member.socket, event);
    }
  }

  private send(socket: WebSocket, event: ServerEvent): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(event));
    } catch {
      // The socket may be closing; a failed send must not abort a broadcast.
    }
  }
}
