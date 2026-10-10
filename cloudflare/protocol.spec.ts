import { describe, it } from "vitest";
import { createContext } from "../test/cloudflare.ts";
import * as protocol from "../test/protocol.ts";

const context = createContext();

describe("sync protocol", () => {
  it("serves health and rejects invalid requests", async () => {
    await protocol.checkHealthAndInvalidRequests(context);
  });

  it("initializes the first client", async () => {
    await protocol.checkFirstClientInitialization(context);
  });

  it("synchronizes two clients and increments revisions", async () => {
    await protocol.checkTwoClientSynchronization(context);
  });

  it("broadcasts join and leave events with metadata", async () => {
    await protocol.checkJoinAndLeaveEvents(context);
  });

  it("reports invalid input, duplicate initialization, and bad patches", async () => {
    await protocol.checkInvalidInput(context);
    await protocol.checkPatchFailures(context);
  });

  it("isolates rooms from one another", async () => {
    await protocol.checkRoomIsolation(context);
  });
});
