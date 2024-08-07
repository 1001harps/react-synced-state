import { randomUUID } from "crypto";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { ServerAction, ServerEvent } from "../common";
import { Connection } from "./types";
import { Room } from "./room";

export const handleWebSocketConnection = (
  ws: WebSocket,
  request: IncomingMessage,
  connections: Connection[],
  rooms: Record<string, Room>
) => {
  const params = new URLSearchParams(request.url?.split("?")[1]);
  const metadata = params.get("metadata");

  let roomId = params.get("roomId");
  if (!roomId) throw "no roomId";

  if (!(roomId in rooms)) {
    rooms[roomId] = new Room();
    if (params.has("initialState")) {
      rooms[roomId].setState(JSON.parse(params.get("initialState")!));
    }
  } else {
    const event: ServerEvent = {
      type: "initial_state",
      state: rooms[roomId].getState(),
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

        console.log("patch", message.patch);

        console.log("before", rooms[roomId].getState());

        rooms[roomId].patchState(message.patch);

        console.log("after", rooms[roomId].getState());

        const event: ServerEvent = {
          type: "state_change",
          patch: message.patch,
          metadata: metadata,
        };

        dispatchToOthers(event);

        break;
      }
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
