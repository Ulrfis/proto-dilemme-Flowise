import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPostHogNetworkRequestMasker,
  normalizePostHogHost,
} from "../client/src/lib/posthog";
import { createFlowiseRequestId } from "../client/src/lib/flowise";

test("PostHog network masker drops bodies and auth headers for sensitive API routes", () => {
  const maskRequest = buildPostHogNetworkRequestMasker();
  const masked = maskRequest({
    name: "https://example.replit.app/api/flowise/prediction/abc/stream",
    method: "POST",
    requestHeaders: { Authorization: "Bearer secret", "Content-Type": "application/json" },
    responseHeaders: { "Set-Cookie": "sid=secret", "Content-Type": "text/event-stream" },
    requestBody: '{"question":"private student text"}',
    responseBody: '{"Response":"private Peter text"}',
  } as any) as any;

  assert.equal(masked.requestBody, undefined);
  assert.equal(masked.responseBody, undefined);
  assert.equal(masked.requestHeaders.Authorization, "[redacted]");
  assert.equal(masked.responseHeaders["Set-Cookie"], "[redacted]");
});

test("PostHog network masker keeps timing metadata for non-sensitive requests", () => {
  const maskRequest = buildPostHogNetworkRequestMasker();
  const masked = maskRequest({
    name: "https://example.replit.app/assets/app.js",
    method: "GET",
    requestHeaders: { Accept: "*/*" },
    status: 200,
  } as any) as any;

  assert.equal(masked.name, "https://example.replit.app/assets/app.js");
  assert.equal(masked.status, 200);
  assert.deepEqual(masked.requestHeaders, { Accept: "*/*" });
});

test("PostHog host normalization supports ingestion and app hosts", () => {
  assert.equal(normalizePostHogHost(undefined), "https://eu.i.posthog.com");
  assert.equal(normalizePostHogHost("https://eu.posthog.com/"), "https://eu.posthog.com");
  assert.equal(normalizePostHogHost(" https://us.i.posthog.com/// "), "https://us.i.posthog.com");
});

test("Flowise request ids are trace-safe and prefixed", () => {
  const id = createFlowiseRequestId();

  assert.match(id, /^fwreq_\d+_[a-z0-9]+$/);
  assert.ok(id.length <= 48);
});
