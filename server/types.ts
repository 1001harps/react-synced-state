import { JsonValue } from "../common/index.ts";

export interface Connection {
  id: string;
  socket: WebSocket;
  roomId: string;
  metadata: JsonValue;
  joined: boolean;
}
