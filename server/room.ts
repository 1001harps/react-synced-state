import { applyPatch, Operation } from "fast-json-patch/index.mjs";

export class Room {
  private state = {};

  setState(state: {}) {
    this.state = state;
  }

  getState() {
    return this.state;
  }

  patchState(patch: Operation[]) {
    const result = applyPatch(this.state, patch);
    this.state = result.newDocument;
  }
}
