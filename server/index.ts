/**
 * WebSocket server that syncs room state between connected clients.
 *
 * @module
 */
import { createHandler, ServerOptions } from "./handlers.ts";

/** A running sync server. */
export interface Server {
  start(port?: number): void;
  shutdown(): Promise<void>;
}

/** Creates a sync server using the provided options. */
export const server = (options: ServerOptions = {}): Server => {
  const handler = createHandler(options);
  let instance: ReturnType<typeof Deno.serve> | undefined;

  return {
    start(port = 8080) {
      if (instance) throw new Error("server is already running");
      instance = Deno.serve({ port }, handler);
    },
    async shutdown() {
      if (!instance) return;
      await instance.shutdown();
      instance = undefined;
    },
  };
};

export type { ServerOptions } from "./handlers.ts";
export { createHandler } from "./handlers.ts";
