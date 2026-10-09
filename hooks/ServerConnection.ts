import { ClientMessage, JsonValue, ServerEvent } from "../common/index.ts";
import { EventListener } from "./events.ts";
import { ConnectionStatus } from "./types.ts";

export type ServerConnectionEvent =
  | {
    type: "status";
    status: ConnectionStatus;
    error?: string;
  }
  | {
    type: "event";
    event: ServerEvent;
  };

interface OpenOptions {
  baseUrl: string;
  roomId: string;
  initialState: JsonValue;
  metadata: JsonValue;
}

export class ServerConnection extends EventListener<ServerConnectionEvent> {
  private socket: WebSocket | undefined;
  private options: OpenOptions | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempts = 0;
  private generation = 0;
  private reconnect = false;
  private queuedMessages: ClientMessage[] = [];

  open(options: OpenOptions) {
    this.close(false);
    this.options = options;
    this.queuedMessages = [];
    this.reconnect = true;
    this.reconnectAttempts = 0;
    const generation = ++this.generation;
    this.connect(generation, "connecting");
  }

  close(notify = true) {
    this.reconnect = false;
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    if (notify) this.notify({ type: "status", status: "closed" });
  }

  dispatch(message: ClientMessage) {
    this.queuedMessages.push(message);
    this.flush();
  }

  private connect(generation: number, status: ConnectionStatus) {
    if (!this.options || generation !== this.generation) return;
    this.notify({ type: "status", status });

    const url = new URL(this.options.baseUrl);
    url.searchParams.set("roomId", this.options.roomId);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect(
        generation,
        "Unable to create WebSocket connection",
      );
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      if (generation !== this.generation || !this.options) return;
      this.reconnectAttempts = 0;
      this.notify({ type: "status", status: "open" });
      socket.send(
        JSON.stringify(
          {
            type: "initialize",
            initialState: this.options.initialState,
            metadata: this.options.metadata,
          } satisfies ClientMessage,
        ),
      );
      this.flush();
    };

    socket.onmessage = (event) => {
      if (generation !== this.generation || typeof event.data !== "string") {
        return;
      }
      try {
        this.notify({
          type: "event",
          event: JSON.parse(event.data) as ServerEvent,
        });
      } catch {
        this.notify({
          type: "status",
          status: "open",
          error: "Unable to read server message",
        });
      }
    };

    socket.onerror = () => {
      if (generation !== this.generation) return;
      this.notify({
        type: "status",
        status: "open",
        error: "WebSocket connection failed",
      });
    };

    socket.onclose = () => {
      if (generation !== this.generation) return;
      this.socket = undefined;
      this.scheduleReconnect(generation);
    };
  }

  private scheduleReconnect(generation: number, error?: string) {
    if (!this.reconnect || generation !== this.generation) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(500 * 2 ** (this.reconnectAttempts - 1), 5_000);
    this.notify({ type: "status", status: "reconnecting", error });
    this.reconnectTimer = setTimeout(
      () => this.connect(generation, "reconnecting"),
      delay,
    );
  }

  private flush() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    while (this.queuedMessages.length > 0) {
      this.socket.send(JSON.stringify(this.queuedMessages.shift()));
    }
  }
}
