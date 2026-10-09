import { Room } from "./room.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
};

Deno.test("Room initializes state and applies JSON patches", () => {
  const room = new Room();
  room.setState({
    steps: [false, false],
    synth: { volume: 0.5 },
  });

  room.patchState([
    { op: "replace", path: "/steps/1", value: true },
    { op: "replace", path: "/synth/volume", value: 0.75 },
  ]);

  assertEquals(room.getState(), {
    steps: [false, true],
    synth: { volume: 0.75 },
  });
});

Deno.test("Room increments its revision for every accepted patch", () => {
  const room = new Room();
  room.setState({ count: 0 });

  room.patchState([{ op: "replace", path: "/count", value: 1 }]);
  room.patchState([{ op: "replace", path: "/count", value: 2 }]);

  assertEquals(room.getRevision(), 2);
  assertEquals(room.getState(), { count: 2 });
});
