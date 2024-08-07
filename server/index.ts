import { randomUUID } from "crypto";
import { applyPatch } from "fast-json-patch";
import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { ServerAction, ServerEvent } from "../common";

const makeExhaustive = (_: never) => {};

interface Connection {
  id: string;
  socket: WebSocket;
  roomId: string;
  metadata: any;
}

const handleConnection = (
  ws: WebSocket,
  request: IncomingMessage,
  connections: Connection[],
  rooms: Record<string, {}>
) => {
  const params = new URLSearchParams(request.url?.split("?")[1]);
  const metadata = params.get("metadata");

  let roomId = params.get("roomId");
  if (!roomId) throw "no roomId";

  if (!(roomId in rooms)) {
    rooms[roomId] = params.has("initialState")
      ? JSON.parse(params.get("initialState") as string)
      : {};
  } else {
    const event: ServerEvent = {
      type: "initial_state",
      state: rooms[roomId],
      metadata,
    };

    ws.send(JSON.stringify(event));
  }

  const connectionId = randomUUID().toString();
  const connection: Connection = {
    id: connectionId,
    roomId,
    socket: ws,
    metadata,
  };
  connections.push(connection);

  const connectionsWithKey = () =>
    connections.filter((c) => c.roomId === roomId);

  const dispatchToOthers = (event: ServerEvent) => {
    connectionsWithKey().forEach((c) => {
      // skip current connection
      if (c.id === connectionId) return;

      c.socket.send(JSON.stringify(event));
    });
  };

  ws.on("error", console.error);

  ws.on("message", function message(data) {
    const message = JSON.parse(data.toString()) as ServerAction;

    switch (message.type) {
      case "state_change": {
        if (!roomId) throw "missing key";

        const prevState = rooms[roomId];
        const result = applyPatch(prevState, message.patch);
        rooms[roomId] = result.newDocument;

        const event: ServerEvent = {
          type: "state_change",
          patch: message.patch,
          metadata: metadata,
        };

        dispatchToOthers(event);

        break;
      }

      default:
        makeExhaustive(message.type);
    }
  });

  ws.on("close", () => {
    dispatchToOthers({
      type: "left",
      metadata,
    });
  });

  dispatchToOthers({
    type: "joined",
    metadata,
  });
};

export const server = () => {
  const connections: Connection[] = [];

  const rooms: Record<string, {}> = {};

  const start = (port: number) => {
    const wss = new WebSocketServer({ port });

    wss.on("connection", (ws, request) =>
      handleConnection(ws, request, connections, rooms)
    );
  };

  return {
    start,
  };
};
