export interface SyncedStateConfig<S, M> {
  initialState: S;
  url: string;
  roomId: string;
  metadata?: M;
}

export type Reducer<S, A> = (prevState: S, action: A) => S;
