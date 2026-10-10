import { createHandler, ServerOptions } from "./handlers.ts";
import type { TestContext, TestSocket } from "../test/protocol.ts";
import * as protocol from "../test/protocol.ts";

const openSocket = (url: string): Promise<TestSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () =>
      resolve({
        send: (data) => socket.send(data),
        close: () => socket.close(),
        onMessage: (listener) =>
          socket.addEventListener("message", (event) => {
            if (typeof event.data === "string") {
              listener(event.data);
            } else if (event.data instanceof Uint8Array) {
              listener(new TextDecoder().decode(event.data));
            }
          }),
        onClose: (listener) =>
          socket.addEventListener("close", () => listener()),
        onError: (listener) =>
          socket.addEventListener("error", (event) => listener(event)),
      });
    socket.onerror = (event) => {
      reject(new Error(`WebSocket connection failed: ${String(event)}`));
    };
  });

const createContext = (port: number): TestContext => ({
  origin: `http://127.0.0.1:${port}`,
  fetch: (input, init) => fetch(input, init),
  connect: (roomId) =>
    openSocket(
      `ws://127.0.0.1:${port}/?roomId=${encodeURIComponent(roomId)}`,
    ),
});

const withServer = async (
  options: ServerOptions,
  run: (context: TestContext) => Promise<void>,
): Promise<void> => {
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1" },
    createHandler(options),
  );
  const { port } = server.addr as Deno.NetAddr;
  try {
    await run(createContext(port));
  } finally {
    await server.shutdown();
  }
};

Deno.test("health, upgrade, and roomId validation", async () => {
  await withServer({}, protocol.checkHealthAndInvalidRequests);
});

Deno.test("first client initialization", async () => {
  await withServer({}, protocol.checkFirstClientInitialization);
});

Deno.test("two-client synchronization and revision increments", async () => {
  await withServer({}, protocol.checkTwoClientSynchronization);
});

Deno.test("join and leave events with metadata", async () => {
  await withServer({}, protocol.checkJoinAndLeaveEvents);
});

Deno.test("invalid input and patch failures", async () => {
  await withServer({}, protocol.checkInvalidInput);
  await withServer({}, protocol.checkPatchFailures);
});

Deno.test("room isolation", async () => {
  await withServer({}, protocol.checkRoomIsolation);
});

Deno.test("rooms keep state while they are alive", async () => {
  await withServer({ roomTtlMs: 2_000 }, async (context) => {
    const roomId = protocol.uniqueRoomId("alive");
    const first = await protocol.TestClient.open(context, roomId);
    await first.initialize({ count: 1 }, {});
    first.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 2 }],
    });
    await first.next("state");
    first.close();

    const second = await protocol.TestClient.open(context, roomId);
    const initial = await second.initialize({ count: 9 }, {});
    protocol.assertEquals(initial.state, { count: 2 }, "retained state");
    protocol.assertEquals(initial.revision, 1, "retained revision");
    second.close();
  });
});

Deno.test("empty rooms expire after the configured TTL", async () => {
  await withServer({ roomTtlMs: 50 }, async (context) => {
    const roomId = protocol.uniqueRoomId("expire");
    const first = await protocol.TestClient.open(context, roomId);
    await first.initialize({ count: 1 }, {});
    first.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 2 }],
    });
    await first.next("state");
    first.close();

    await protocol.delay(200);

    const second = await protocol.TestClient.open(context, roomId);
    const initial = await second.initialize({ count: 9 }, {});
    protocol.assertEquals(initial.state, { count: 9 }, "fresh state");
    protocol.assertEquals(initial.revision, 0, "fresh revision");
    second.close();
  });
});
