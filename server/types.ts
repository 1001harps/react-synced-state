import { JsonValue } from "../common/index.ts";

/** A connected client WebSocket. */
export interface Connection {
  id: string;
  socket: WebSocket;
  roomId: string;
  metadata: JsonValue;
  joined: boolean;
}
