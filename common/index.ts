/**
 * Shared wire types exchanged between the synced state client and server.
 *
 * @module
 */
import { Operation } from "npm:fast-json-patch@^3.1.1/index.mjs";

/** Any value that can be represented as JSON. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Message sent from a client to the server. */
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

/** Event notifying that a member joined or left a room. */
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

/** A member currently present in a room. */
export interface RoomMember {
  connectionId: string;
  metadata: JsonValue;
}

/** Event sent from the server to clients. */
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
