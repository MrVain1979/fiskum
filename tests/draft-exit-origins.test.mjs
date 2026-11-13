import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    return specifier === "../../../../lib/content-path"
      ? { url: new URL("../lib/content-path.ts", import.meta.url).href, shortCircuit: true }
      : next(specifier, context);
  },
});
const { GET } = await import("../app/api/draft-mode/disable/route.ts");
const www = "https://www.fiskum-sveis.no";
const deployment = "https://fiskum-studio-immutable.vercel.app";
const branch = "https://fiskum-studio-git-feature.vercel.app";
const keys = ["VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "FRONTEND_ORIGIN"];

async function withEnv(values, run) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_URL: new URL(deployment).hostname,
  VERCEL_BRANCH_URL: new URL(branch).hostname,
};
const exit = (origin, headers = { referer: `${origin}/om-oss/` }) =>
  GET(new Request(`${origin}/api/draft-mode/disable`, { headers }));

function assertExit(response, origin) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 8);
  assert.equal(cookies.filter((cookie) => /; Partitioned$/.test(cookie)).length, 4);
  for (const name of ["__prerender_bypass", "sanity-preview-perspective", "sanity-preview-variant", "sanity-preview-partitioned"]) {
    const pair = cookies.filter((cookie) => cookie.startsWith(`${name}=`));
    assert.equal(pair.length, 2);
    for (const cookie of pair) {
      assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly/);
      assert.match(cookie, /Path=\//);
    }
    assert.match(pair[0], origin.startsWith("https:") ? /SameSite=Lax; Secure$/ : /SameSite=Lax$/);
    assert.match(pair[1], /SameSite=None; Secure; Partitioned$/);
  }
}
function assertRejected(response) {
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.getSetCookie().length, 0);
}

test("private deployment and branch exits each keep their exact origin and all cookie expiries", async () => {
  await withEnv(preview, async () => {
    for (const origin of [deployment, branch]) {
      assertExit(await exit(origin), origin);
      assertExit(await exit(origin, { referer: `${origin}/studio/`, origin }), origin);
    }
  });
});

test("branch support does not weaken same-origin Referer, Origin or exact-host checks", async () => {
  await withEnv(preview, async () => {
    for (const [origin, headers] of [
      [branch, {}],
      [branch, { referer: "invalid" }],
      [branch, { referer: `${deployment}/` }],
      [branch, { referer: `${branch}/`, origin: "https://evil.test" }],
      ["https://fiskum-studio.vercel.app", { referer: "https://fiskum-studio.vercel.app/" }],
      ["https://fiskum-studio-other.vercel.app", { referer: "https://fiskum-studio-other.vercel.app/", host: new URL(branch).host, "x-forwarded-host": new URL(branch).host }],
    ]) assertRejected(await exit(origin, headers));
  });
});

test("production and development ignore private Vercel names and preserve the canonical exit", async () => {
  for (const environment of ["production", "development", undefined]) {
    await withEnv({ ...preview, VERCEL_ENV: environment }, async () => {
      assertExit(await exit(www), www);
      assertRejected(await exit(deployment));
      assertRejected(await exit(branch));
    });
  }
});

test("explicit frontend origin still wins over both Preview names, including local HTTP", async () => {
  for (const origin of [www, "http://localhost:3345"]) {
    await withEnv({ ...preview, FRONTEND_ORIGIN: origin }, async () => {
      assertExit(await exit(origin), origin);
      assertRejected(await exit(deployment));
      assertRejected(await exit(branch));
    });
  }
});

test("malformed branch values cannot add another origin", async () => {
  for (const host of ["https://evil.test", "evil.test", "*.vercel.app", "fiskum-studio-git-feature.vercel.app:443", "attacker@fiskum-studio-git-feature.vercel.app", "fiskum-studio-git-feature.vercel.app/path"]) {
    await withEnv({ ...preview, VERCEL_BRANCH_URL: host }, async () => {
      assertExit(await exit(deployment), deployment);
      assertRejected(await exit(branch));
    });
  }
});
