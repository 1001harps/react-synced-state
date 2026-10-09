/** Configuration for connecting a synced state hook to a server room. */
export interface SyncedStateConfig<S, M> {
  initialState: S;
  url: string;
  roomId: string;
  metadata?: M;
}

/** Reducer for producing the next state from a previous state and action. */
export type Reducer<S, A> = (prevState: S, action: A) => S;

/** Lifecycle status of the connection to the sync server. */
export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

/** A member connected to a room. */
export interface SyncedMember<M> {
  connectionId: string;
  metadata: M;
}

/** Snapshot of the connection to the sync server. */
export interface SyncedConnection<M> {
  status: ConnectionStatus;
  error?: string;
  connectionId?: string;
  members: SyncedMember<M>[];
}
