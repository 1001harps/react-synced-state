export interface Connection {
  id: string;
  socket: WebSocket;
  roomId: string;
  metadata: any;
}
