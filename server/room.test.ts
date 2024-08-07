import { compare, Operation } from "fast-json-patch/index.mjs";

import { Room } from "./room";

const getPatch = (s1: any, s2: any) => {
  return compare(s1, s2);
};

describe("Room", () => {
  test("patches basic object", () => {
    // setup
    const initialState = { test: 1 };
    const room = new Room();
    room.setState(initialState);
    const expected = { test: 2 };

    // apply patch
    const s = room.getState();
    const patch = getPatch(initialState, expected);
    room.patchState(patch);

    // assert patch worked
    expect(s).toMatchObject(expected);
  });

  test("patches nested properties", () => {
    // setup
    const initialState = {
      test: [false, false, false],
      test2: [
        {
          active: false,
          value: 123,
        },
      ],
    };
    const room = new Room();
    room.setState(initialState);
    const expected = {
      test: [false, true, false],
      test2: [
        {
          active: true,
          value: 234,
        },
      ],
    };

    // apply patch
    const s = room.getState();
    const patch = getPatch(initialState, expected);
    room.patchState(patch);

    // assert patch worked
    expect(s).toMatchObject(expected);
  });

  test("patches nested properties", () => {
    // setup
    const initialState = {
      bpm: 120,
      samplePlayerParams: {
        volume: 0.75,
        sample: 0.84,
        octave: 0.69,
        filterCutoff: 0.5,
        filterRes: 0,
        filterEnvMod: 0,
        attack: 0,
        release: 0.3,
      },
      drumMachineParams: {
        volume: 0.86,
      },
      synthSteps: [
        {
          active: false,
          value: 0.5,
        },
        {
          active: false,
          value: 0.27,
        },
        {
          active: false,
          value: 0.39,
        },
        {
          active: false,
          value: 0.2,
        },
        {
          active: true,
          value: 0.53,
        },
        {
          active: false,
          value: 0.01,
        },
        {
          active: true,
          value: 0.15,
        },
        {
          active: true,
          value: 0.07,
        },
        {
          active: false,
          value: 0.01,
        },
        {
          active: true,
          value: 0.32,
        },
        {
          active: true,
          value: 0.71,
        },
        {
          active: false,
          value: 0.48,
        },
        {
          active: true,
          value: 0.01,
        },
        {
          active: true,
          value: 0.01,
        },
        {
          active: false,
          value: 0.93,
        },
        {
          active: true,
          value: 0,
        },
      ],
      drumMachineSteps: [
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, true, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, true, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
      ],
    };
    const room = new Room();
    room.setState(initialState);
    const expected = {
      bpm: 120,
      samplePlayerParams: {
        volume: 0.75,
        sample: 0.84,
        octave: 0.69,
        filterCutoff: 0.5,
        filterRes: 0,
        filterEnvMod: 0,
        attack: 0,
        release: 0.3,
      },
      drumMachineParams: {
        volume: 0.86,
      },
      synthSteps: [
        {
          active: false,
          value: 0.5,
        },
        {
          active: false,
          value: 0.27,
        },
        {
          active: false,
          value: 0.39,
        },
        {
          active: false,
          value: 0.2,
        },
        {
          active: true,
          value: 0.53,
        },
        {
          active: false,
          value: 0.01,
        },
        {
          active: true,
          value: 0.15,
        },
        {
          active: true,
          value: 0.07,
        },
        {
          active: false,
          value: 0.01,
        },
        {
          active: true,
          value: 0.32,
        },
        {
          active: true,
          value: 0.71,
        },
        {
          active: false,
          value: 0.48,
        },
        {
          active: true,
          value: 0.01,
        },
        {
          active: true,
          value: 0.01,
        },
        {
          active: false,
          value: 0.93,
        },
        {
          active: true,
          value: 0,
        },
      ],
      drumMachineSteps: [
        [true, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, true, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [true, false, true, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false],
      ],
    };

    // apply patch
    const s = room.getState();
    const patch: Operation[] = [
      { op: "replace", path: "/drumMachineSteps/0/0", value: true },
    ];
    room.patchState(patch);

    // assert patch worked
    expect(s).toMatchObject(expected);
  });
});
