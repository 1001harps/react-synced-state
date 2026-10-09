export interface SyncedStateConfig<S, M> {
  initialState: S;
  url: string;
  roomId: string;
  metadata?: M;
}

export type Reducer<S, A> = (prevState: S, action: A) => S;

export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface SyncedMember<M> {
  connectionId: string;
  metadata: M;
}

export interface SyncedConnection<M> {
  status: ConnectionStatus;
  error?: string;
  connectionId?: string;
  members: SyncedMember<M>[];
}
