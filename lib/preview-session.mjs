import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PREVIEW_COOKIE = "fiskum_preview";
export const PREVIEW_SESSION_SECONDS = 15 * 60;
export const PREVIEW_SOURCE = "fiskum.studio.preview";

export const previewHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
};

export function previewConfig(env = process.env) {
  const projectId = env.SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID || env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = env.SANITY_DATASET || env.SANITY_STUDIO_DATASET || env.NEXT_PUBLIC_SANITY_DATASET;
  const token = env.SANITY_API_READ_TOKEN;
  if (!projectId || !dataset || !token) throw new Error("Preview configuration unavailable");
  return { projectId, dataset, token };
}

function signature(payload, config) {
  // Separate this use from Sanity's bearer token and any other cookie signatures.
  const key = createHmac("sha256", config.token)
    .update("fiskum/preview-session/signing-key/v1")
    .digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issuePreviewSession(config, origin, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + PREVIEW_SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    projectId: config.projectId,
    dataset: config.dataset,
    origin,
    issuedAt,
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  return { value: `${payload}.${signature(payload, config)}`, expiresAt: expiresAt * 1000 };
}

export function verifyPreviewSession(value, config, origin, now = Date.now()) {
  if (typeof value !== "string" || value.length > 2048) return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  const [payload, mac] = parts;
  const expected = signature(payload, config);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const seconds = Math.floor(now / 1000);
    return session.v === 1 && session.projectId === config.projectId &&
      session.dataset === config.dataset && session.origin === origin &&
      Number.isSafeInteger(session.issuedAt) && Number.isSafeInteger(session.expiresAt) &&
      session.issuedAt <= seconds + 5 && session.expiresAt > seconds &&
      session.expiresAt - session.issuedAt === PREVIEW_SESSION_SECONDS;
  } catch {
    return false;
  }
}

export function isAuthorizedPreviewRequest(request, config = previewConfig(), now = Date.now()) {
  const cookies = (request.headers.get("cookie") || "").split(";")
    .map((cookie) => cookie.trim()).filter((cookie) => cookie.startsWith(`${PREVIEW_COOKIE}=`));
  // Ambiguous duplicate cookies are rejected instead of choosing one by order.
  return cookies.length === 1 && verifyPreviewSession(
    cookies[0].slice(PREVIEW_COOKIE.length + 1), config, new URL(request.url).origin, now,
  );
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === new URL(request.url).origin && (!fetchSite || fetchSite === "same-origin");
}

export function sessionCookie(value, origin, maxAge = PREVIEW_SESSION_SECONDS) {
  return `${PREVIEW_COOKIE}=${value}; Path=/preview; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(origin).protocol === "https:" ? "; Secure" : ""}`;
}

function response(body, status, cookie) {
  return Response.json(body, { status, headers: {
    ...previewHeaders,
    Vary: "Cookie, Origin",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  } });
}

async function readSecret(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const { secret } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof secret === "string" && /^[A-Za-z0-9_-]{20,256}$/.test(secret) ? secret : null;
  } catch {
    return null;
  }
}

export function createPreviewSessionHandlers({ getConfig = previewConfig, verifySecret, now = Date.now }) {
  return {
    async POST(request) {
      if (!isSameOriginRequest(request)) return response({ error: "Forbidden" }, 403);
      const secret = await readSecret(request);
      if (!secret) return response({ error: "Unauthorized" }, 401);
      const origin = new URL(request.url).origin;
      try {
        const config = getConfig();
        if (!await verifySecret(config, secret, origin)) return response({ error: "Unauthorized" }, 401);
        const session = issuePreviewSession(config, origin, now());
        return response({ ok: true, expiresAt: session.expiresAt }, 200, sessionCookie(session.value, origin));
      } catch {
        // Do not serialize Sanity errors: they can contain credential-bearing requests.
        return response({ error: "Preview unavailable" }, 503);
      }
    },
    async DELETE(request) {
      if (!isSameOriginRequest(request)) return response({ error: "Forbidden" }, 403);
      return response({ ok: true }, 200, sessionCookie("", new URL(request.url).origin, 0));
    },
  };
}
