/**
 * Cloudflare runtime adapter for the shared protocol test suite.
 *
 * This module runs inside workerd, so it is only imported by the
 * Cloudflare spec files.
 *
 * @module
 */
import { exports } from "cloudflare:workers";
import {
  assertEquals,
  type TestContext,
  type TestSocket,
} from "./protocol.ts";

const origin = "http://example.com";

const connect = async (roomId: string): Promise<TestSocket> => {
  const response = await exports.default.fetch(
    `${origin}/?roomId=${encodeURIComponent(roomId)}`,
    { headers: { upgrade: "websocket" } },
  );
  assertEquals(response.status, 101, "upgrade status");

  const socket = response.webSocket;
  if (!socket) throw new Error("expected a WebSocket upgrade response");
  socket.accept();

  return {
    send: (data) => socket.send(data),
    close: () => socket.close(),
    onMessage: (listener) =>
      socket.addEventListener("message", (event) => {
        listener(
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer),
        );
      }),
    onClose: (listener) => socket.addEventListener("close", () => listener()),
    onError: (listener) =>
      socket.addEventListener("error", (event) => listener(event)),
  };
};

/** Creates a context that drives the deployed Worker from tests. */
export const createContext = (): TestContext => ({
  origin,
  fetch: (input, init) => exports.default.fetch(input, init),
  connect,
});
