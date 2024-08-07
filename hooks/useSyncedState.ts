import { applyPatch, compare } from "fast-json-patch/index.mjs";
import { useEffect, useState, useRef } from "react";
import { ServerConnection, ServerConnectionEvent } from "./ServerConnection";
import { useInstance } from "./useInstance";
import { deepClone } from "fast-json-patch";
import { SyncedStateConfig } from "./types";

export const useSyncedState = <S extends {}, M extends {}>(
  config: SyncedStateConfig<S, M>
): [S, (s: S) => void] => {
  const [internalState, setInternalState] = useState(config.initialState);
  const stateRef = useRef<S>(internalState);
  stateRef.current = internalState;

  const connection = useInstance(() => new ServerConnection());
  const metadata = config.metadata || ({} as M);

  const setState = (nextState: S) => {
    const prevState = deepClone(internalState);
    const patch = compare(prevState, nextState);

    setInternalState(nextState);

    connection.dispatch({
      type: "state_change",
      patch,
    });
  };

  useEffect(() => {
    const listener = (event: ServerConnectionEvent) => {
      switch (event.type) {
        case "open": {
          break;
        }

        case "event": {
          switch (event.event.type) {
            case "state_change": {
              const prevState = deepClone(stateRef.current);
              const result = applyPatch(prevState, event.event.patch);
              setInternalState({ ...result.newDocument });
              break;
            }

            case "initial_state": {
              const state = JSON.parse(event.event.state);
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

    connection.open(config.url, metadata, config.initialState, config.roomId);

    return () => connection.removeEventListener(listener);
  }, []);

  return [internalState, setState];
};
