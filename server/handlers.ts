import { JsonValue, ServerEvent } from "../common/index.ts";
import { DEFAULT_ROOM_TTL_MS, isClientMessage } from "../common/validation.ts";
import { Room } from "./room.ts";
import { Connection } from "./types.ts";

/** Options for configuring the sync server. */
export interface ServerOptions {
  roomTtlMs?: number;
  onRoomMembershipChange?: (roomId: string, members: number) => void;
}

const send = (socket: WebSocket, event: ServerEvent) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
};

/** Creates a request handler that manages rooms and syncs state over WebSockets. */
export const createHandler = (
  options: ServerOptions = {},
): (request: Request) => Response => {
  const roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
  const rooms = new Map<string, Room>();
  const connections = new Map<string, Connection>();

  const notifyMembershipChange = (room: Room, roomId: string) => {
    options.onRoomMembershipChange?.(roomId, room.members.size);
  };

  const broadcast = (room: Room, event: ServerEvent) => {
    for (const connection of room.members) send(connection.socket, event);
  };

  const leave = (connection: Connection) => {
    if (!connection.joined) return;

    connection.joined = false;
    const room = rooms.get(connection.roomId);
    if (!room) return;

    room.members.delete(connection);
    notifyMembershipChange(room, connection.roomId);
    broadcast(room, {
      type: "left",
      connectionId: connection.id,
      metadata: connection.metadata,
    });

    if (room.members.size === 0) {
      room.expireAfter(roomTtlMs, () => {
        if (room.members.size === 0) rooms.delete(connection.roomId);
      });
    }
  };

  const join = (
    connection: Connection,
    initialState: JsonValue,
    metadata: JsonValue,
  ) => {
    let room = rooms.get(connection.roomId);
    if (!room) {
      room = new Room();
      rooms.set(connection.roomId, room);
    }

    connection.metadata = metadata;
    room.cancelExpiry();

    if (!room.isInitialized()) room.setState(initialState);

    room.members.add(connection);
    connection.joined = true;
    notifyMembershipChange(room, connection.roomId);

    send(connection.socket, {
      type: "initial_state",
      state: room.getState(),
      revision: room.getRevision(),
      connectionId: connection.id,
      members: [...room.members].map((member) => ({
        connectionId: member.id,
        metadata: member.metadata,
      })),
    });

    for (const member of room.members) {
      if (member.id === connection.id) continue;
      send(member.socket, {
        type: "joined",
        connectionId: connection.id,
        metadata,
      });
    }
  };

  return (request: Request): Response => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("This endpoint expects a WebSocket", { status: 426 });
    }

    const roomId = url.searchParams.get("roomId");
    if (!roomId) return new Response("Missing roomId", { status: 400 });

    const { socket, response } = Deno.upgradeWebSocket(request);
    const connection: Connection = {
      id: crypto.randomUUID(),
      socket,
      roomId,
      metadata: null,
      joined: false,
    };

    socket.onopen = () => {
      connections.set(connection.id, connection);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as unknown;
        if (!isClientMessage(message)) {
          send(socket, { type: "error", message: "Invalid client message" });
          return;
        }

        if (message.type === "initialize") {
          if (connection.joined) {
            send(socket, { type: "error", message: "Already initialized" });
            return;
          }
          join(connection, message.initialState, message.metadata);
          return;
        }

        if (!connection.joined) {
          send(socket, {
            type: "error",
            message: "Initialize before updating state",
          });
          return;
        }

        const room = rooms.get(connection.roomId);
        if (!room) {
          send(socket, { type: "error", message: "Room no longer exists" });
          return;
        }

        try {
          room.patchState(message.patch);
        } catch {
          send(socket, {
            type: "error",
            message: "Unable to apply state patch",
          });
          send(socket, {
            type: "state",
            state: room.getState(),
            revision: room.getRevision(),
            originConnectionId: connection.id,
            metadata: connection.metadata,
          });
          return;
        }

        broadcast(room, {
          type: "state",
          state: room.getState(),
          revision: room.getRevision(),
          originConnectionId: connection.id,
          metadata: connection.metadata,
        });
      } catch {
        send(socket, {
          type: "error",
          message: "Unable to read client message",
        });
      }
    };

    const disconnect = () => {
      connections.delete(connection.id);
      leave(connection);
    };

    socket.onclose = disconnect;
    socket.onerror = disconnect;

    return response;
  };
};
