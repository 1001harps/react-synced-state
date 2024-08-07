import { deepClone } from "fast-json-patch";
import { applyPatch, compare } from "fast-json-patch/index.mjs";
import { useEffect, useRef, useState } from "react";
import { ServerConnection, ServerConnectionEvent } from "./ServerConnection";
import { useInstance } from "./useInstance";
import { Reducer, SyncedStateConfig } from "./types";

export const useSyncedStateReducer = <S extends {}, M extends {}, A extends {}>(
  config: SyncedStateConfig<S, M>,
  reducer: Reducer<S, A>
): [S, (action: A) => void] => {
  const [internalState, setInternalState] = useState<S>(config.initialState);
  const stateRef = useRef<S>(internalState);
  stateRef.current = internalState;

  const connection = useInstance(() => new ServerConnection());
  const metadata = config.metadata || ({} as M);

  const dispatch = (action: A) => {
    const prevState = deepClone(internalState);
    const nextState = reducer(prevState, action);
    const patch = compare(internalState, nextState);

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
              setInternalState(event.event.state);
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

  return [internalState, dispatch];
};
