import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleWebSocketConnection } from "./handlers";
import { Room } from "./room";
import { Connection } from "./types";

interface Server {
  start(port: number): void;
}

export const server = (): Server => {
  const connections: Connection[] = [];

  const rooms: Record<string, Room> = {};

  const start = (port: number) => {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws, request) =>
      handleWebSocketConnection(ws, request, connections, rooms)
    );

    server.on("request", (request, response) => {
      const { method, url, headers } = request;

      if (method === "GET" && url === "/debug") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.write(JSON.stringify(rooms));
        response.end();
      }
    });

    server.listen(port);
  };

  return {
    start,
  };
};
