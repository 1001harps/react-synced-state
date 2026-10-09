import { applyPatch, Operation } from "npm:fast-json-patch@^3.1.1/index.mjs";
import { JsonValue } from "../common/index.ts";
import { Connection } from "./types.ts";

/** Holds the synced state for a room and tracks its connected members. */
export class Room {
  readonly members = new Set<Connection>();
  private state: JsonValue | undefined;
  private revision = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  isInitialized() {
    return this.state !== undefined;
  }

  setState(state: JsonValue) {
    this.state = state;
  }

  getState() {
    if (this.state === undefined) {
      throw new Error("room has not been initialized");
    }
    return this.state;
  }

  getRevision() {
    return this.revision;
  }

  patchState(patch: Operation[]) {
    const result = applyPatch(this.getState(), patch, true, false);
    this.state = result.newDocument;
    this.revision += 1;
  }

  cancelExpiry() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }

  expireAfter(timeoutMs: number, onExpire: () => void) {
    this.cancelExpiry();
    this.expiryTimer = setTimeout(onExpire, timeoutMs);
  }
}
