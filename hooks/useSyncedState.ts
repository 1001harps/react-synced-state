import { applyPatch, compare } from "fast-json-patch";
import { useEffect, useState } from "react";
import { EventListener } from "./events";
import { useInstance } from "./useInstance";
import { ServerAction, ServerEvent } from "../common";

type ServerConnectionEvent =
  | {
      type: "open";
    }
  | {
      type: "event";
      event: ServerEvent;
    };

class ServerConnection extends EventListener<ServerConnectionEvent> {
  socket: WebSocket | undefined;

  open(metadata: any, initialState: any, roomId: string) {
    const baseUrl = `ws://localhost:8080`;

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

export const useSyncedState = <S extends {}, M extends {}>(
  initialState: S,
  metadata?: M
): [S, (s: S) => void, (roomId: string) => void, boolean] => {
  const [internalState, setInternalState] = useState(initialState);
  const [active, setActive] = useState(false);

  const connection = useInstance(() => new ServerConnection());

  if (!metadata) metadata = {} as M;

  const open = (roomId: string) => {
    connection.open(metadata, initialState, roomId);
  };

  useEffect(() => {}, [internalState]);

  const setState = (s: S) => {
    var patch = compare(internalState, s);

    setInternalState(s);

    connection.dispatch({
      type: "state_change",
      patch,
    });
  };

  useEffect(() => {
    const listener = (event: ServerConnectionEvent) => {
      console.log("event", event);
      switch (event.type) {
        case "open": {
          setActive(true);
          break;
        }

        case "event": {
          switch (event.event.type) {
            case "state_change": {
              console.log("state_change", event.event.patch);
              const result = applyPatch(internalState, event.event.patch);

              console.log("result", result.newDocument);

              setInternalState({ ...result.newDocument });
              break;
            }

            case "initial_state": {
              console.log(event);
              const state = JSON.parse(event.event.state);
              console.log("initial_state", { state });
              setInternalState(state);
              break;
            }

            case "joined":
            case "left":
              break;
          }
        }
      }
    };

    connection.addEventListener(listener);

    return () => connection.removeEventListener(listener);
  }, []);

  return [internalState, setState, open, active];
};
