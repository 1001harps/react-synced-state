import { compare, deepClone } from "npm:fast-json-patch@^3.1.1/index.mjs";
import { useEffect, useRef, useState } from "npm:react@^18.3.1";
import { JsonValue } from "../common/index.ts";
import { ServerConnection, ServerConnectionEvent } from "./ServerConnection.ts";
import {
  Reducer,
  SyncedConnection,
  SyncedMember,
  SyncedStateConfig,
} from "./types.ts";
import { useInstance } from "./useInstance.ts";

const initialConnection = <M>(): SyncedConnection<M> => ({
  status: "connecting",
  members: [],
});

export const useSyncedStateReducer = <
  S extends {},
  M extends {},
  A,
>(
  config: SyncedStateConfig<S, M>,
  reducer: Reducer<S, A>,
): [S, (action: A) => void, SyncedConnection<M>] => {
  const [internalState, setInternalState] = useState<S>(config.initialState);
  const [connectionState, setConnectionState] = useState<SyncedConnection<M>>(
    initialConnection<M>(),
  );
  const stateRef = useRef<S>(internalState);
  const revisionRef = useRef(-1);
  stateRef.current = internalState;

  const connection = useInstance(() => new ServerConnection());
  const metadata = (config.metadata ?? {}) as M;

  const dispatch = (action: A) => {
    const previousState = deepClone(stateRef.current);
    const nextState = reducer(previousState, action);
    const patch = compare(stateRef.current, nextState);
    setInternalState(nextState);
    connection.dispatch({ type: "state_change", patch });
  };

  useEffect(() => {
    revisionRef.current = -1;
    setInternalState(config.initialState);
    setConnectionState(initialConnection<M>());

    const listener = (event: ServerConnectionEvent) => {
      if (event.type === "status") {
        setConnectionState((current) => ({
          ...current,
          status: event.status,
          error: event.error,
          connectionId: event.status === "reconnecting"
            ? undefined
            : current.connectionId,
          members: event.status === "reconnecting" ? [] : current.members,
        }));
        return;
      }

      const serverEvent = event.event;
      switch (serverEvent.type) {
        case "initial_state":
          if (serverEvent.revision >= revisionRef.current) {
            revisionRef.current = serverEvent.revision;
            setInternalState(serverEvent.state as S);
          }
          setConnectionState((current) => ({
            ...current,
            connectionId: serverEvent.connectionId,
            members: serverEvent.members as SyncedMember<M>[],
          }));
          break;
        case "state":
          if (serverEvent.revision >= revisionRef.current) {
            revisionRef.current = serverEvent.revision;
            setInternalState(serverEvent.state as S);
          }
          break;
        case "joined": {
          const member = {
            connectionId: serverEvent.connectionId,
            metadata: serverEvent.metadata as M,
          };
          setConnectionState((current) => ({
            ...current,
            members: [
              ...current.members.filter((existing) =>
                existing.connectionId !== member.connectionId
              ),
              member,
            ],
          }));
          break;
        }
        case "left":
          setConnectionState((current) => ({
            ...current,
            members: current.members.filter((member) =>
              member.connectionId !== serverEvent.connectionId
            ),
          }));
          break;
        case "error":
          setConnectionState((current) => ({
            ...current,
            error: serverEvent.message,
          }));
          break;
      }
    };

    connection.addEventListener(listener);
    connection.open({
      baseUrl: config.url,
      roomId: config.roomId,
      initialState: config.initialState as JsonValue,
      metadata: metadata as JsonValue,
    });

    return () => {
      connection.removeEventListener(listener);
      connection.close();
    };
  }, [config.url, config.roomId]);

  return [internalState, dispatch, connectionState];
};
