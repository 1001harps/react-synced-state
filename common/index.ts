import { Operation } from "npm:fast-json-patch@^3.1.1/index.mjs";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ClientMessage =
  | {
    type: "initialize";
    initialState: JsonValue;
    metadata: JsonValue;
  }
  | {
    type: "state_change";
    patch: Operation[];
  };

export type PresenceEvent =
  | {
    type: "joined";
    connectionId: string;
    metadata: JsonValue;
  }
  | {
    type: "left";
    connectionId: string;
    metadata: JsonValue;
  };

export interface RoomMember {
  connectionId: string;
  metadata: JsonValue;
}

export type ServerEvent =
  | {
    type: "initial_state";
    state: JsonValue;
    revision: number;
    connectionId: string;
    members: RoomMember[];
  }
  | {
    type: "state";
    state: JsonValue;
    revision: number;
    originConnectionId: string;
    metadata: JsonValue;
  }
  | PresenceEvent
  | {
    type: "error";
    message: string;
  };
