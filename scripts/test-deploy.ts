/**
 * Temporary end-to-end check for a deployed Cloudflare sync server.
 *
 * Usage:
 *   node scripts/test-deploy.ts wss://react-synced-state-dev.<account>.workers.dev
 *
 * Requires Node 22.18+, where TypeScript type stripping is enabled by default.
 *
 * @module
 */
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  checkFirstClientInitialization,
  checkHealthAndInvalidRequests,
  checkInvalidInput,
  checkJoinAndLeaveEvents,
  checkPatchFailures,
  checkRoomIsolation,
  checkTwoClientSynchronization,
  type TestContext,
  type TestSocket,
} from "../test/protocol.ts";

const input = process.argv[2];
if (!input) {
  console.error(
    "Usage: node scripts/test-deploy.ts <wss://your-worker.workers.dev>",
  );
  process.exit(1);
}

const target = new URL(input.includes("://") ? input : `https://${input}`);
const secure = target.protocol === "https:" || target.protocol === "wss:";
const httpOrigin = `${secure ? "https" : "http"}://${target.host}`;
const wsOrigin = `${secure ? "wss" : "ws"}://${target.host}`;

const connect = (roomId: string): Promise<TestSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${wsOrigin}/?roomId=${encodeURIComponent(roomId)}`,
    );
    socket.onopen = () =>
      resolve({
        send: (data) => socket.send(data),
        close: () => socket.close(),
        onMessage: (listener) =>
          socket.addEventListener("message", (event) => {
            if (typeof event.data === "string") listener(event.data);
          }),
        onClose: (listener) =>
          socket.addEventListener("close", () => listener()),
        onError: (listener) =>
          socket.addEventListener("error", (event) => listener(event)),
      });
    socket.onerror = () =>
      reject(new Error(`Unable to connect to ${wsOrigin}`));
  });

const context: TestContext = {
  origin: httpOrigin,
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return fetch(input, init);
    }

    // Node's fetch rejects the forbidden `Upgrade` header, so send the
    // upgrade probe over a raw HTTP(S) request instead. Cloudflare's edge
    // requires a complete handshake before forwarding the request.
    const send = secure ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const request = send(input, {
        method: init?.method ?? "GET",
        headers: {
          connection: "Upgrade",
          upgrade: "websocket",
          "sec-websocket-key": randomBytes(16).toString("base64"),
          "sec-websocket-version": "13",
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
            }),
          ));
      });
      request.on("error", reject);
      request.end();
    });
  },
  connect,
};

const checks: Array<[string, (context: TestContext) => Promise<void>]> = [
  ["health and request validation", checkHealthAndInvalidRequests],
  ["first client initialization", checkFirstClientInitialization],
  ["two-client synchronization", checkTwoClientSynchronization],
  ["join and leave events", checkJoinAndLeaveEvents],
  [
    "invalid input and patch failures",
    async (context) => {
      await checkInvalidInput(context);
      await checkPatchFailures(context);
    },
  ],
  ["room isolation", checkRoomIsolation],
];

console.log(`Testing ${wsOrigin}\n`);

let failures = 0;
for (const [name, check] of checks) {
  process.stdout.write(`  ${name} ... `);
  try {
    await check(context);
    console.log("ok");
  } catch (error) {
    failures += 1;
    console.log("FAILED");
    console.log(
      `    ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks.length} checks failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed`);
