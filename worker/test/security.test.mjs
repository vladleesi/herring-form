import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";

globalThis.File ??= NodeFile;

const { default: worker } = await import("../src/index.js");

const origin = "http://127.0.0.1:8765";
const measurementNames = [
  "@NckCirc",
  "@NckToEarLngth",
  "@CllrWdth",
  "@ChLngthToFL",
  "@ChLngthToAntAxFld",
  "@LngthBtwnFL",
  "@AntAxFldCirc",
  "@AntAxFldToGrndHght",
  "@NckToAntAxFldLngth",
  "@AntAxFldToTailLngth",
  "@NckToGrndHght",
  "@LngthOfOutSdFL",
  "@LngthOfInSdFL",
  "@LngthBtwnFlds",
  "@PstAxFldCirc",
  "@PstAxFldToGrndHght",
  "@LngthOfInSdHL",
  "@HLCirc",
  "@LowFLCirc",
  "@LowHLCirc"
];

function createCsv({ fullName = "Measurement" } = {}) {
  return [
    "Name,Calculated value (cm),Full name,Formula (cm)",
    ...measurementNames.map((name) => `${name},10,${fullName},`)
  ].join("\r\n");
}

function createRequest(csv = createCsv(), requestOrigin = origin) {
  const form = new FormData();
  form.append("name", "Customer");
  form.append("contactType", "email");
  form.append("contact", "customer@example.com");
  form.append("message", "Test");
  form.append("turnstileToken", "test-token");
  form.append("file", new Blob([csv], { type: "text/csv" }), "measurements.csv");

  return new Request("https://measurement-email-api-dev.example/api/send-csv", {
    method: "POST",
    headers: { Origin: requestOrigin },
    body: form
  });
}

function createEnv() {
  return {
    ALLOWED_ORIGINS: `${origin},http://localhost:8765`,
    DELIVERY_MODE: "mock",
    TURNSTILE_SECRET_KEY: "test-secret",
    SUBMISSION_RATE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };
}

const originalFetch = globalThis.fetch;

test.before(() => {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    return Response.json({
      success: true,
      action: "",
      hostname: "example.com"
    });
  };
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("accepts a valid request in mock mode without sending email", async () => {
  const response = await worker.fetch(createRequest(), createEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { delivered: false, mode: "mock" });
});

test("rejects spreadsheet-formula content in the CSV", async () => {
  const response = await worker.fetch(createRequest(createCsv({ fullName: "=1+1" })), createEnv());
  assert.equal(response.status, 400);
});

test("rejects an origin outside the environment allowlist", async () => {
  const response = await worker.fetch(createRequest(createCsv(), "https://example.com"), createEnv());
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects a request body larger than the configured limit", async () => {
  const response = await worker.fetch(createRequest(`${createCsv()}${"x".repeat(130 * 1024)}`), createEnv());
  assert.equal(response.status, 413);
});
