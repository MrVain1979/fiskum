import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "next-sanity";
import {
  createPreviewSessionHandlers,
  isAuthorizedPreviewRequest,
  issuePreviewSession,
  PREVIEW_COOKIE,
  PREVIEW_SESSION_SECONDS,
  verifyPreviewSession,
} from "../lib/preview-session.mjs";
import { validateStudioPreviewSecret } from "../lib/sanity-preview-secret.mjs";

const config = { projectId: "testproject", dataset: "production", token: "test-only-server-token" };
const origin = "https://fiskum.example";
const now = Date.UTC(2026, 9, 12);
const testSecret = "temporary-test-secret-1234567890";
const request = (path = "/preview/", headers = {}) => new Request(`${origin}${path}`, { headers });

test("anonymous requests and forged Studio Referer never authorize draft rendering", () => {
  assert.equal(isAuthorizedPreviewRequest(request(), config, now), false);
  assert.equal(isAuthorizedPreviewRequest(request("/preview/", { referer: `${origin}/studio/` }), config, now), false);
  assert.equal(isAuthorizedPreviewRequest(request("/preview/?sanity-preview-secret=anything", { referer: `${origin}/studio/` }), config, now), false);
});

test("signed session authorizes only its project, dataset, origin, token and lifetime", () => {
  const { value } = issuePreviewSession(config, origin, now);
  assert.equal(isAuthorizedPreviewRequest(request("/preview/", { cookie: `${PREVIEW_COOKIE}=${value}` }), config, now), true);
  assert.equal(verifyPreviewSession(value, config, origin, now + PREVIEW_SESSION_SECONDS * 1000 - 1000), true);
  assert.equal(verifyPreviewSession(value, config, origin, now + PREVIEW_SESSION_SECONDS * 1000), false);
  assert.equal(verifyPreviewSession(value, config, origin, now - 10_000), false);
  for (const changed of [{ projectId: "other" }, { dataset: "other" }, { token: "other" }]) {
    assert.equal(verifyPreviewSession(value, { ...config, ...changed }, origin, now), false);
  }
  assert.equal(verifyPreviewSession(value, config, "https://other.example", now), false);
  assert.equal(verifyPreviewSession(`${value.slice(0, -1)}!`, config, origin, now), false);
  assert.equal(verifyPreviewSession(`${value}.extra`, config, origin, now), false);
  assert.equal(isAuthorizedPreviewRequest(request("/preview/", { cookie: `${PREVIEW_COOKIE}=${value}; ${PREVIEW_COOKIE}=${value}` }), config, now), false);
});

function post(secret = testSecret, headers = {}, body) {
  return new Request(`${origin}/preview/session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: body ?? JSON.stringify({ secret }),
  });
}

test("session POST verifies secret, sends only HttpOnly scoped cookie, and DELETE clears it", async () => {
  const calls = [];
  const handlers = createPreviewSessionHandlers({
    getConfig: () => config, now: () => now,
    verifySecret: async (...args) => { calls.push(args); return args[1] === testSecret; },
  });
  const response = await handlers.POST(post());
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], config);
  assert.equal(calls[0][2], origin);
  assert.match(response.headers.get("set-cookie"), /Path=\/preview; HttpOnly; SameSite=Strict; Max-Age=900; Secure$/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("vary"), /Cookie/);
  const body = await response.text();
  assert.equal(body.includes(testSecret), false);
  assert.equal(body.includes(config.token), false);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(isAuthorizedPreviewRequest(request("/preview/", { cookie }), config, now), true);
  assert.equal((await handlers.POST(post("bad-secret-12345678901234567890"))).status, 401);
  const ended = await handlers.DELETE(new Request(`${origin}/preview/session`, { method: "DELETE", headers: { origin } }));
  assert.equal(ended.status, 200);
  assert.match(ended.headers.get("set-cookie"), /Max-Age=0/);
});

test("cross-origin, malformed, oversized and missing-secret requests fail without Sanity lookup", async () => {
  let calls = 0;
  const handlers = createPreviewSessionHandlers({ getConfig: () => config, verifySecret: async () => { calls++; return true; } });
  assert.equal((await handlers.POST(post(testSecret, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handlers.POST(post(testSecret, { origin: "" }))).status, 403);
  assert.equal((await handlers.POST(post(testSecret, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handlers.DELETE(new Request(`${origin}/preview/session`, { method: "DELETE" }))).status, 403);
  assert.equal((await handlers.POST(post(testSecret, {}, "not JSON"))).status, 401);
  assert.equal((await handlers.POST(post(""))).status, 401);
  assert.equal((await handlers.POST(post(testSecret, { "content-type": "text/plain" }))).status, 401);
  assert.equal((await handlers.POST(post(testSecret, {}, JSON.stringify({ secret: testSecret, oversized: "x".repeat(3000) })))).status, 401);
  assert.equal(calls, 0);
});

test("upstream errors never serialize server token, preview secret or Sanity request", async () => {
  const handlers = createPreviewSessionHandlers({ getConfig: () => config, verifySecret: async () => { throw new Error(`${config.token} ${testSecret}`); } });
  const response = await handlers.POST(post());
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '{"error":"Preview unavailable"}');
  assert.equal(response.headers.has("set-cookie"), false);
});

function sanityStub({ valid = true, studioUrl = `${origin}/studio/`, scoped = true } = {}) {
  const calls = [];
  const configs = [];
  const client = {
    config: () => ({ token: config.token }),
    withConfig: (value) => { configs.push(value); return client; },
    getDataUrl: () => `/data/query/${config.dataset}`,
    request: async (options) => {
      const { query, params } = options.body;
      calls.push({ query, params, options });
      if (query.startsWith("count(")) return { result: scoped };
      return { result: { private: valid ? { _id: "drafts.test", _updatedAt: new Date(now).toISOString(), secret: testSecret, studioUrl } : null, public: null } };
    },
  };
  return { client, calls, configs };
}

test("actual Sanity validator uses uncached POST, authenticates draft secret and scopes it to Studio", async () => {
  const { client, calls, configs } = sanityStub();
  assert.equal(await validateStudioPreviewSecret(client, testSecret, origin), true);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.fetch.cache, "no-store");
    assert.equal(call.options.uri.includes(testSecret), false);
    assert.equal(call.options.uri, `/data/query/${config.dataset}`);
    assert.equal(call.params.secret, testSecret);
  }
  assert.match(calls[0].query, /dateTime\(_updatedAt\).*3600/);
  assert.match(calls[1].query, /source == \$source/);
  assert.equal(calls[1].params.studioUrl, `${origin}/studio/`);
  assert.ok(configs.some((value) => value.perspective === "raw" && value.useCdn === false));
});

test("invalid/expired/unrelated dataset secret, another Studio and shared-only secret are refused", async () => {
  // No matching dataset document is how Sanity represents expired or foreign secrets.
  for (const fixture of [{ valid: false }, { studioUrl: "https://other.example/studio/" }, { scoped: false }]) {
    const { client } = sanityStub(fixture);
    assert.equal(await validateStudioPreviewSecret(client, testSecret, origin), false);
  }
  const { client } = sanityStub();
  assert.equal(await validateStudioPreviewSecret(client, "a-different-secret-1234567890", origin), false);
});

test("real Sanity client sends secret lookups as POST bodies with no secret in HTTP URLs", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  // Intercept only the final network boundary: the real SDK constructs the full
  // URL, method, headers and JSON body before this fake transport receives them.
  globalThis.fetch = async (url, options) => {
    const data = JSON.parse(options.body);
    calls.push({ method: options.method, url: String(url), data, authorization: new Headers(options.headers).get("authorization"), cache: options.cache });
    const result = data.query.startsWith("count(") ? true : {
      private: { _id: "drafts.test", _updatedAt: new Date(now).toISOString(), secret: testSecret, studioUrl: `${origin}/studio/` },
      public: null,
    };
    return Response.json({ result });
  };
  try {
    const client = createClient({ ...config, apiVersion: "2025-02-19", useCdn: false });
    assert.equal(await validateStudioPreviewSecret(client, testSecret, origin), true);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.method, "POST");
      assert.equal(call.url.includes(testSecret), false);
      assert.equal(call.url.includes("query="), false);
      assert.equal(call.data.params.secret, testSecret);
      assert.equal(call.authorization, `Bearer ${config.token}`);
      assert.equal(call.cache, "no-store");
      assert.match(call.url, /perspective=raw/);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("actual preview route rejects forged Referer before fetching; authorized draft renders without global content minimums", async () => {
  const { GET } = await import("../app/preview/[[...slug]]/route.js");
  const previousFetch = globalThis.fetch;
  const env = {
    ...Object.fromEntries(["SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID", "NEXT_PUBLIC_SANITY_PROJECT_ID"].map((key) => [key, config.projectId])),
    ...Object.fromEntries(["SANITY_DATASET", "SANITY_STUDIO_DATASET", "NEXT_PUBLIC_SANITY_DATASET"].map((key) => [key, config.dataset])),
    ...Object.fromEntries(["SANITY_API_VERSION", "SANITY_STUDIO_API_VERSION", "NEXT_PUBLIC_SANITY_API_VERSION"].map((key) => [key, "2025-02-19"])),
    ...Object.fromEntries([
      "SANITY_API_READ_TOKEN", "SANITY_READ_TOKEN", "SANITY_VIEWER_TOKEN", "SANITY_PREVIEW_TOKEN",
      "SANITY_STUDIO_READ_TOKEN", "SANITY_STUDIO_API_TOKEN", "SANITY_TOKEN", "SANITY_AUTH_TOKEN",
    ].map((key) => [key, config.token])),
  };
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, `${config.projectId}.api.sanity.io`);
    assert.equal(new URL(url).pathname, `/v2025-02-19/data/query/${config.dataset}`);
    assert.equal(new URL(url).searchParams.get("perspective"), "drafts");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Authorization, `Bearer ${config.token}`);
    return Response.json({ result: {
      settings: { companyName: "Test company" },
      pages: [{ _id: "drafts.preview-test", _type: "page", slug: "preview-test", title: "Unpublished test title" }],
      services: [], references: [], newsPosts: [],
    } });
  };
  try {
    const context = { params: Promise.resolve({ slug: ["preview-test"] }) };
    assert.equal((await GET(request("/preview/preview-test/", { referer: `${origin}/studio/` }), context)).status, 403);
    assert.equal(calls, 0);
    const session = issuePreviewSession(config, origin);
    const response = await GET(request("/preview/preview-test/?id=preview-test", { cookie: `${PREVIEW_COOKIE}=${session.value}` }), context);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Unpublished test title/);
    assert.match(html, /Sanity draft preview/);
    assert.equal(html.includes(config.token), false);
    assert.equal(html.includes(session.value), false);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
