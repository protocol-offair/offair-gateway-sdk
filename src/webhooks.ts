import { AirPayGatewayValidationError } from "./errors";
import type { GatewayWebhookEvent } from "./types";

export type GatewayWebhookHeaders =
  | Headers
  | Record<string, string | number | string[] | null | undefined>;

export interface VerifyGatewayWebhookOptions {
  payload: string | GatewayWebhookEvent | Record<string, unknown>;
  headers: GatewayWebhookHeaders;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}

export interface SignGatewayWebhookOptions {
  payload: string | GatewayWebhookEvent | Record<string, unknown>;
  secret: string;
  timestamp?: number;
}

export interface GatewayWebhookVerification {
  ok: boolean;
  event?: GatewayWebhookEvent;
  reason?: string;
}

function headerValue(headers: GatewayWebhookHeaders, name: string): string | undefined {
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName || value === undefined || value === null) {
      continue;
    }
    return Array.isArray(value) ? value[0] : String(value);
  }
  return undefined;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function canonicalGatewayJson(payload: GatewayWebhookEvent | Record<string, unknown>): string {
  return JSON.stringify(sortValue(payload));
}

function payloadBody(payload: string | GatewayWebhookEvent | Record<string, unknown>): string {
  return typeof payload === "string" ? payload : canonicalGatewayJson(payload);
}

function normalizeSignature(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("sha256=") ? value.slice("sha256=".length) : value;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    const { createHmac } = await import("node:crypto");
    return createHmac("sha256", secret).update(message).digest("hex");
  }

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export async function signGatewayWebhookPayload(options: SignGatewayWebhookOptions): Promise<{ timestamp: string; signature: string }> {
  if (!options.secret.trim()) {
    throw new AirPayGatewayValidationError("Webhook secret is required.");
  }
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const body = payloadBody(options.payload);
  const digest = await hmacSha256Hex(options.secret, `${timestamp}.${body}`);
  return {
    timestamp,
    signature: `sha256=${digest}`,
  };
}

export async function verifyGatewayWebhookSignature(options: VerifyGatewayWebhookOptions): Promise<GatewayWebhookVerification> {
  const timestamp = headerValue(options.headers, "x-timestamp");
  const receivedSignature = normalizeSignature(headerValue(options.headers, "x-signature"));

  if (!timestamp || !receivedSignature) {
    return { ok: false, reason: "Missing webhook signature headers." };
  }
  if (!options.secret.trim()) {
    return { ok: false, reason: "Webhook secret is required." };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "Invalid webhook timestamp." };
  }

  const toleranceSeconds = options.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: "Webhook timestamp is outside the allowed tolerance." };
  }

  const body = payloadBody(options.payload);
  const expected = await hmacSha256Hex(options.secret, `${timestamp}.${body}`);
  if (!timingSafeEqualHex(expected, receivedSignature)) {
    return { ok: false, reason: "Webhook signature mismatch." };
  }

  const event = typeof options.payload === "string" ? (JSON.parse(options.payload) as GatewayWebhookEvent) : (options.payload as GatewayWebhookEvent);
  return { ok: true, event };
}

export async function assertGatewayWebhookSignature(options: VerifyGatewayWebhookOptions): Promise<GatewayWebhookEvent> {
  const verification = await verifyGatewayWebhookSignature(options);
  if (!verification.ok || !verification.event) {
    throw new AirPayGatewayValidationError(verification.reason ?? "Webhook signature verification failed.");
  }
  return verification.event;
}
