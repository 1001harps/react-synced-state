import { Operation } from "fast-json-patch";

export type ServerAction = {
  type: "state_change";
  patch: Operation[];
};

export type BaseServerEvent =
  | {
      type: "joined";
    }
  | {
      type: "left";
    }
  | { type: "initial_state"; state: any }
  | {
      type: "state_change";
      patch: Operation[];
    };

export type ServerEvent = BaseServerEvent & { metadata: any };
