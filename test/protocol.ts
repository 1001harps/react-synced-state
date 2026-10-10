/**
 * Protocol expectations shared by the Deno and Cloudflare server tests.
 *
 * The scenarios only rely on platform WebSocket and HTTP primitives, so both
 * server implementations can run the same checks against the wire protocol.
 *
 * @module
 */
import type { ClientMessage, JsonValue, ServerEvent } from "../common/index.ts";

/** Minimal socket surface the shared protocol tests depend on. */
export interface TestSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: unknown) => void): void;
}

/** Runtime-specific hooks used to drive the shared protocol scenarios. */
export interface TestContext {
  /** Base HTTP origin of the server, without a trailing slash. */
  readonly origin: string;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  connect(roomId: string): Promise<TestSocket>;
}

/** Event type narrowed to a specific server event `type`. */
export type EventOf<T extends ServerEvent["type"]> = Extract<
  ServerEvent,
  { type: T }
>;

/** Returns a room ID that will not collide with other test scenarios. */
export const uniqueRoomId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID()}`;

/** Waits for the given number of milliseconds. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Throws when the condition is falsy. */
export const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

/** Throws when the JSON representations do not match. */
export const assertEquals = (
  actual: unknown,
  expected: unknown,
  label: string,
): void => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expected ${expectedJson}, received ${actualJson}`,
    );
  }
};

/** Test client that tracks the events received from a room. */
export class TestClient {
  private readonly socket: TestSocket;
  private readonly queue: ServerEvent[] = [];
  private closed = false;

  private constructor(socket: TestSocket) {
    this.socket = socket;
    socket.onMessage((data) => {
      this.queue.push(JSON.parse(data) as ServerEvent);
    });
    socket.onClose(() => {
      this.closed = true;
    });
    socket.onError(() => {
      this.closed = true;
    });
  }

  /** Opens a connection to the given room. */
  static async open(
    context: TestContext,
    roomId: string,
  ): Promise<TestClient> {
    return new TestClient(await context.connect(roomId));
  }

  /** Sends a client message. */
  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Sends raw data, used for malformed message tests. */
  sendRaw(data: string): void {
    this.socket.send(data);
  }

  /** Initializes the connection and returns the resulting server event. */
  async initialize(
    initialState: JsonValue,
    metadata: JsonValue = {},
  ): Promise<EventOf<"initial_state">> {
    this.send({ type: "initialize", initialState, metadata });
    return await this.next("initial_state");
  }

  /** Closes the connection. */
  close(): void {
    this.socket.close();
  }

  /** Waits for the next event and asserts that it has the expected type. */
  async next<T extends ServerEvent["type"]>(
    type: T,
    timeoutMs = 5_000,
  ): Promise<EventOf<T>> {
    const deadline = Date.now() + timeoutMs;
    while (this.queue.length === 0) {
      if (this.closed) {
        throw new Error(`socket closed before receiving "${type}" message`);
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for "${type}" message`);
      }
      await delay(5);
    }

    const event = this.queue.shift()!;
    if (event.type !== type) {
      throw new Error(
        `expected "${type}" message, received "${event.type}"`,
      );
    }
    return event as EventOf<T>;
  }

  /** Asserts that no further events arrive within the timeout. */
  async expectNoMessage(timeoutMs = 100): Promise<void> {
    await delay(timeoutMs);
    if (this.queue.length > 0) {
      throw new Error(
        `expected no messages, received ${JSON.stringify(this.queue)}`,
      );
    }
  }
}

/** Checks the health endpoint and request validation before the upgrade. */
export const checkHealthAndInvalidRequests = async (
  context: TestContext,
): Promise<void> => {
  const health = await context.fetch(`${context.origin}/health`);
  assertEquals(health.status, 200, "health status");
  assertEquals(await health.json(), { ok: true }, "health body");

  const plain = await context.fetch(`${context.origin}/`);
  assertEquals(plain.status, 426, "plain request status");
  assertEquals(
    await plain.text(),
    "This endpoint expects a WebSocket",
    "plain request body",
  );

  const missing = await context.fetch(`${context.origin}/`, {
    headers: { upgrade: "websocket" },
  });
  assertEquals(missing.status, 400, "missing room status");
  assertEquals(await missing.text(), "Missing roomId", "missing room body");
};

/** Checks first-client initialization and its presence payload. */
export const checkFirstClientInitialization = async (
  context: TestContext,
): Promise<void> => {
  const client = await TestClient.open(context, uniqueRoomId("init"));
  const initial = await client.initialize({ count: 0 }, { name: "Agnes" });

  assertEquals(initial.state, { count: 0 }, "initial state");
  assertEquals(initial.revision, 0, "initial revision");
  assert(
    typeof initial.connectionId === "string" &&
      initial.connectionId.length > 0,
    "initial connection id",
  );
  assertEquals(
    initial.members,
    [{ connectionId: initial.connectionId, metadata: { name: "Agnes" } }],
    "initial members",
  );

  client.close();
};

/** Checks synchronization between two clients and revision increments. */
export const checkTwoClientSynchronization = async (
  context: TestContext,
): Promise<void> => {
  const roomId = uniqueRoomId("sync");
  const a = await TestClient.open(context, roomId);
  await a.initialize({ count: 0 }, { name: "a" });

  const b = await TestClient.open(context, roomId);
  const bInitial = await b.initialize({ count: 100 }, { name: "b" });
  assertEquals(bInitial.state, { count: 0 }, "shared state");
  assertEquals(bInitial.revision, 0, "shared revision");
  assertEquals(bInitial.members.length, 2, "member count");

  const joined = await a.next("joined");
  assertEquals(joined.connectionId, bInitial.connectionId, "joined id");
  assertEquals(joined.metadata, { name: "b" }, "joined metadata");

  b.send({
    type: "state_change",
    patch: [{ op: "replace", path: "/count", value: 1 }],
  });
  const aState = await a.next("state");
  const bState = await b.next("state");
  assertEquals(aState.state, { count: 1 }, "broadcast state");
  assertEquals(aState.revision, 1, "broadcast revision");
  assertEquals(aState.originConnectionId, bInitial.connectionId, "origin id");
  assertEquals(aState.metadata, { name: "b" }, "origin metadata");
  assertEquals(bState.state, { count: 1 }, "state echoed to origin");
  assertEquals(bState.revision, 1, "revision echoed to origin");

  b.send({
    type: "state_change",
    patch: [{ op: "replace", path: "/count", value: 2 }],
  });
  const aSecond = await a.next("state");
  const bSecond = await b.next("state");
  assertEquals(aSecond.state, { count: 2 }, "second patch state");
  assertEquals(aSecond.revision, 2, "second patch revision");
  assertEquals(bSecond.state, { count: 2 }, "second patch echo");
  assertEquals(bSecond.revision, 2, "second patch echo revision");

  a.close();
  b.close();
};

/** Checks join and leave presence events with metadata. */
export const checkJoinAndLeaveEvents = async (
  context: TestContext,
): Promise<void> => {
  const roomId = uniqueRoomId("presence");
  const a = await TestClient.open(context, roomId);
  await a.initialize({ members: [] }, { name: "a" });

  const b = await TestClient.open(context, roomId);
  const bInitial = await b.initialize({ members: [] }, { name: "b" });

  const joined = await a.next("joined");
  assertEquals(joined.connectionId, bInitial.connectionId, "joined id");
  assertEquals(joined.metadata, { name: "b" }, "joined metadata");

  b.close();
  const left = await a.next("left");
  assertEquals(left.connectionId, bInitial.connectionId, "left id");
  assertEquals(left.metadata, { name: "b" }, "left metadata");

  a.close();
};

/** Checks invalid messages, duplicate initialization, and bad patches. */
export const checkInvalidInput = async (
  context: TestContext,
): Promise<void> => {
  const roomId = uniqueRoomId("invalid");
  const client = await TestClient.open(context, roomId);

  client.send({ type: "state_change", patch: [] });
  assertEquals(
    (await client.next("error")).message,
    "Initialize before updating state",
    "state change before initialize",
  );

  client.sendRaw("not json");
  assertEquals(
    (await client.next("error")).message,
    "Unable to read client message",
    "unreadable message",
  );

  await client.initialize({ count: 0 }, {});

  client.send({ type: "initialize", initialState: { count: 0 }, metadata: {} });
  assertEquals(
    (await client.next("error")).message,
    "Already initialized",
    "duplicate initialize",
  );

  client.sendRaw(JSON.stringify({ type: "bogus" }));
  assertEquals(
    (await client.next("error")).message,
    "Invalid client message",
    "invalid message",
  );

  client.close();
};

/** Checks that failed patches report an error and the canonical state. */
export const checkPatchFailures = async (
  context: TestContext,
): Promise<void> => {
  const roomId = uniqueRoomId("patch");
  const client = await TestClient.open(context, roomId);
  const initial = await client.initialize({ count: 0 }, { name: "p" });

  client.send({
    type: "state_change",
    patch: [{ op: "replace", path: "/count/deep", value: 1 }],
  });
  assertEquals(
    (await client.next("error")).message,
    "Unable to apply state patch",
    "patch error",
  );

  const state = await client.next("state");
  assertEquals(state.state, { count: 0 }, "canonical state");
  assertEquals(state.revision, 0, "canonical revision");
  assertEquals(state.originConnectionId, initial.connectionId, "patch origin");
  assertEquals(state.metadata, { name: "p" }, "patch metadata");

  client.close();
};

/** Checks that rooms are isolated from one another. */
export const checkRoomIsolation = async (
  context: TestContext,
): Promise<void> => {
  const a = await TestClient.open(context, uniqueRoomId("isolation-a"));
  const b = await TestClient.open(context, uniqueRoomId("isolation-b"));
  await a.initialize({ room: "a" }, {});
  await b.initialize({ room: "b" }, {});

  a.send({
    type: "state_change",
    patch: [{ op: "replace", path: "/room", value: "changed" }],
  });
  assertEquals((await a.next("state")).state, { room: "changed" }, "room a");
  await b.expectNoMessage(100);

  a.close();
  b.close();
};
