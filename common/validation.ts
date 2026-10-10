/**
 * Validation helpers shared by the sync server implementations.
 *
 * @module
 */
import type { ClientMessage, JsonValue } from "./index.ts";

/** Default time before an empty room is deleted, in milliseconds. */
export const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000;

/** Returns true when the value can be serialized as JSON. */
export const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }

  if (Array.isArray(value)) return value.every(isJsonValue);

  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
};

/** Returns true when the value is a client message understood by the server. */
export const isClientMessage = (value: unknown): value is ClientMessage => {
  if (!value || typeof value !== "object" || !("type" in value)) return false;

  const message = value as Record<string, unknown>;
  if (message.type === "initialize") {
    return isJsonValue(message.initialState) && isJsonValue(message.metadata);
  }

  return message.type === "state_change" && Array.isArray(message.patch);
};
