import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleWebSocketConnection } from "./handlers";
import { Room } from "./room";
import { Connection } from "./types";
import winston from "winston";

interface Server {
  start(port: number): void;
}

const { combine, timestamp, json } = winston.format;

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  format: combine(timestamp(), json()),
  level: "info",
});

export const server = (): Server => {
  const connections: Connection[] = [];

  const rooms: Record<string, Room> = {};

  const start = (port: number) => {
    const server = createServer((req, res) => {
      const { method, url } = req;
      const { statusCode, statusMessage } = res;

      if (statusCode >= 400) {
        logger.error({ method, url, statusCode, statusMessage });
      } else {
        logger.info({ method, url, statusCode, statusMessage });
      }
    });

    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws, request) =>
      handleWebSocketConnection(ws, request, logger, connections, rooms)
    );

    server.on("request", (request, response) => {
      const { method, url } = request;

      if (method === "GET" && url === "/debug") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.write(JSON.stringify(rooms));
        response.end();
      }
    });

    // clean up room state periodically
    setInterval(() => {
      const roomsInUse = new Set([...connections.map((x) => x.roomId)]);

      Object.keys(rooms).forEach((id) => {
        if (!(id in roomsInUse)) {
          delete rooms[id];
        }
      });
    }, 5000);

    server.listen(port, () =>
      logger.info(`[server]: Server is running at http://localhost:${port}`)
    );
  };

  return {
    start,
  };
};
