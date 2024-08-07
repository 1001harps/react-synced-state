import { ServerAction, ServerEvent } from "../common";
import { EventListener } from "./events";

export type ServerConnectionEvent =
  | {
      type: "open";
    }
  | {
      type: "event";
      event: ServerEvent;
    };

export class ServerConnection extends EventListener<ServerConnectionEvent> {
  socket: WebSocket | undefined;

  open(baseUrl: string, metadata: any, initialState: any, roomId: string) {
    const params = new URLSearchParams();

    params.append("roomId", roomId);
    params.append("initialState", JSON.stringify(initialState));
    params.append("metadata", JSON.stringify(metadata));

    const url = `${baseUrl}?${params.toString()}`;

    const socket = new WebSocket(url);

    socket.addEventListener("open", (event) => {
      this.notify({ type: "open" });
    });

    socket.addEventListener("message", (event) => {
      const serverEvent: ServerEvent = JSON.parse(event.data);
      this.notify({
        type: "event",
        event: serverEvent,
      });
    });

    socket.addEventListener("close", console.log);
    socket.addEventListener("error", console.error);

    this.socket = socket;
  }

  dispatch(action: ServerAction) {
    console.log("dispatching", action, { s: this.socket });
    this.socket?.send(JSON.stringify(action));
  }
}
