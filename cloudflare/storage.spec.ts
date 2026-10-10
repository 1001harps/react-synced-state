import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createContext } from "../test/cloudflare.ts";
import * as protocol from "../test/protocol.ts";

const context = createContext();

const alarmTime = async (stub: DurableObjectStub): Promise<number | null> =>
  await runInDurableObject(
    stub,
    (_instance, state) => state.storage.getAlarm() as Promise<number | null>,
  );

const waitForAlarm = async (stub: DurableObjectStub): Promise<number> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const scheduled = await alarmTime(stub);
    if (scheduled !== null) return scheduled;
    await protocol.delay(20);
  }
  throw new Error("timed out waiting for a room expiry alarm");
};

describe("room storage", () => {
  it("keeps state across connections while the room is alive", async () => {
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

  it("cancels the expiry alarm when a member rejoins", async () => {
    const roomId = protocol.uniqueRoomId("cancel");
    const first = await protocol.TestClient.open(context, roomId);
    await first.initialize({ count: 1 }, {});
    first.close();

    const stub = env.SYNC_ROOMS.getByName(roomId);
    await waitForAlarm(stub);

    const second = await protocol.TestClient.open(context, roomId);
    const initial = await second.initialize({ count: 9 }, {});
    protocol.assertEquals(initial.state, { count: 1 }, "retained state");
    expect(await alarmTime(stub)).toBeNull();

    second.close();
  });

  it("expires empty rooms, then allows reinitialization", async () => {
    const roomId = protocol.uniqueRoomId("expire");
    const first = await protocol.TestClient.open(context, roomId);
    await first.initialize({ count: 1 }, {});
    first.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 2 }],
    });
    await first.next("state");
    first.close();

    const stub = env.SYNC_ROOMS.getByName(roomId);
    const scheduled = await waitForAlarm(stub);
    expect(scheduled).toBeGreaterThan(Date.now());
    expect(scheduled).toBeLessThanOrEqual(Date.now() + 60_000);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await alarmTime(stub)).toBeNull();

    const second = await protocol.TestClient.open(context, roomId);
    const initial = await second.initialize({ count: 9 }, {});
    protocol.assertEquals(initial.state, { count: 9 }, "fresh state");
    protocol.assertEquals(initial.revision, 0, "fresh revision");
    second.close();
  });

  it("keeps storage when the expiry alarm fires while members are present", async () => {
    const roomId = protocol.uniqueRoomId("active");
    const client = await protocol.TestClient.open(context, roomId);
    await client.initialize({ count: 1 }, {});
    client.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 2 }],
    });
    await client.next("state");

    const stub = env.SYNC_ROOMS.getByName(roomId);
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.setAlarm(Date.now() + 60_000));

    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const second = await protocol.TestClient.open(context, roomId);
    const initial = await second.initialize({ count: 9 }, {});
    protocol.assertEquals(initial.state, { count: 2 }, "kept state");
    protocol.assertEquals(initial.revision, 1, "kept revision");

    client.close();
    second.close();
  });

  it("restores state and members after eviction", async () => {
    const roomId = protocol.uniqueRoomId("evict");
    const a = await protocol.TestClient.open(context, roomId);
    await a.initialize({ count: 1 }, { name: "a" });
    a.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 2 }],
    });
    await a.next("state");

    const stub = env.SYNC_ROOMS.getByName(roomId);
    await evictDurableObject(stub);

    // The client socket is hibernated rather than closed, so sending wakes
    // the Durable Object and the attachment data is restored.
    a.send({
      type: "state_change",
      patch: [{ op: "replace", path: "/count", value: 3 }],
    });
    const state = await a.next("state");
    protocol.assertEquals(state.state, { count: 3 }, "state after eviction");
    protocol.assertEquals(state.revision, 2, "revision after eviction");

    const b = await protocol.TestClient.open(context, roomId);
    const initial = await b.initialize({ count: 0 }, { name: "b" });
    protocol.assertEquals(initial.state, { count: 3 }, "persisted state");
    protocol.assertEquals(initial.revision, 2, "persisted revision");
    protocol.assertEquals(initial.members.length, 2, "restored members");

    await a.next("joined");
    a.close();
    b.close();
  });
});
