import { randomUUID } from 'node:crypto';

export const MAX_BODY_BYTES = 64 * 1024;
const MAX_FIELD_LENGTH = 10000;
const API_VERSION = 'v2025-02-19';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HONEYPOTS = new Set(['_honey', '_gotcha', 'botcheck', 'honeypot']);
const RESERVED = new Set(['submissionId', ...HONEYPOTS]);
const EMAIL = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const SAVED_MESSAGE = 'Takk! Henvendelsen din er mottatt.';
const SAVE_ERROR = 'Henvendelsen kunne ikke lagres. Prøv igjen om litt, eller kontakt oss direkte på e-post eller telefon.';

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isEmail = (value) => value.length <= 254 && EMAIL.test(value);
const escapeHtml = (value) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wantsJson = (request) => (request.headers.get('accept') || '').toLowerCase().includes('application/json');

function response(request, status, message, extraHeaders = {}) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders };
  if (wantsJson(request)) {
    return Response.json({ success: status >= 200 && status < 300, message }, { status, headers });
  }
  return new Response(`<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kontaktskjema</title><main><h1>${status < 400 ? 'Takk for henvendelsen' : 'Henvendelsen ble ikke mottatt'}</h1><p>${escapeHtml(message)}</p><p>Du kan gå tilbake til skjemaet og prøve igjen.</p></main></html>`, {
    status,
    headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
  });
}

function getDependencies(overrides = {}) {
  return {
    fetch: overrides.fetch || globalThis.fetch,
    vercelUrl: overrides.vercelUrl ?? process.env.VERCEL_URL,
    productionUrl: overrides.productionUrl ?? process.env.VERCEL_PROJECT_PRODUCTION_URL,
    environment: overrides.environment ?? process.env.NODE_ENV,
  };
}

function siteOrigin(siteUrl) {
  const url = new URL(siteUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hostname.includes('*')) throw new Error('Invalid siteUrl');
  if (url.protocol !== 'https:' && !isLocal(url.hostname)) throw new Error('HTTPS siteUrl required');
  return url.origin;
}

function isLocal(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function previewHost(value) {
  if (!value) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !url.hostname.endsWith('.vercel.app')) return null;
    return url.host;
  } catch { return null; }
}

function trustedRequestOrigin(requestUrl, canonicalOrigin, dependencies, explicitOrigins = []) {
  if (requestUrl.origin === canonicalOrigin || explicitOrigins.includes(requestUrl.origin)) return requestUrl.origin;
  if (requestUrl.protocol === 'https:' && [previewHost(dependencies.vercelUrl), previewHost(dependencies.productionUrl)].includes(requestUrl.host)) return requestUrl.origin;
  if (dependencies.environment !== 'production' && isLocal(requestUrl.hostname) && ['http:', 'https:'].includes(requestUrl.protocol)) return requestUrl.origin;
  return null;
}

function validateConfig(config) {
  if (!config || !/^[a-z0-9]+$/.test(config.projectId || '') || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.dataset || '') || typeof config.token !== 'string' || !config.token.trim()) throw new Error('Missing Sanity configuration');
  const origin = siteOrigin(config.siteUrl);
  if (config.allowedOrigins !== undefined && (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.some((value) => typeof value !== 'string' || siteOrigin(value) !== value))) throw new Error('Invalid allowedOrigins');
  if (!config.forms || !Object.keys(config.forms).length) throw new Error('Missing forms');
  return origin;
}

function formConfig(requestUrl, config) {
  const configuredIds = Object.keys(config.forms);
  const queryId = requestUrl.searchParams.get('form');
  const pathId = requestUrl.pathname.split('/').filter(Boolean).at(-1);
  const id = queryId !== null ? queryId : (Object.hasOwn(config.forms, pathId || '') ? pathId : configuredIds.length === 1 ? configuredIds[0] : '');
  if (!id || !Object.hasOwn(config.forms, id)) throw new RequestError(404, 'Fant ikke dette kontaktskjemaet.');
  const form = config.forms[id];
  const recipient = form.recipient || '';
  if ((!isEmail(recipient) && !/^[a-f0-9]{32}$/i.test(recipient)) || !form.title || /[\r\n]/.test(form.title)) throw new Error('Invalid form configuration');
  if (!Array.isArray(form.allowedFields) || !Array.isArray(form.requiredFields)) throw new Error('Invalid field configuration');
  if (form.allowedFields.some((field) => typeof field !== 'string' || !field || field.startsWith('_') || RESERVED.has(field) || ['__proto__', 'constructor', 'prototype'].includes(field))) throw new Error('Reserved field configuration');
  if (form.requiredFields.some((field) => !form.allowedFields.includes(field)) || (form.emailField && !form.allowedFields.includes(form.emailField)) || form.nameFields?.some((field) => !form.allowedFields.includes(field))) throw new Error('Unknown field configuration');
  if (form.cc && form.cc.split(/[,;]/).some((email) => !isEmail(email.trim()))) throw new Error('Invalid CC configuration');
  const successUrl = new URL(form.successPath, config.siteUrl);
  if (successUrl.origin !== siteOrigin(config.siteUrl) || !['http:', 'https:'].includes(successUrl.protocol) || successUrl.username || successUrl.password) throw new Error('Invalid success URL');
  return { id, form, successUrl };
}

async function boundedBody(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new RequestError(413, 'Skjemaet er for stort. Kort ned teksten og prøv igjen.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'Skjemaet er for stort. Kort ned teksten og prøv igjen.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function parseFields(request) {
  const bytes = await boundedBody(request);
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let entries;
  try {
    if (type === 'application/json') {
      const object = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!object || Array.isArray(object) || typeof object !== 'object') throw new Error();
      entries = Object.entries(object);
    } else if (type === 'application/x-www-form-urlencoded') {
      entries = [...new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes))];
    } else if (type === 'multipart/form-data') {
      entries = [...await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') } }).formData()];
    } else {
      throw new RequestError(415, 'Ukjent skjemaformat. Last siden på nytt og prøv igjen.');
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'Skjemaet kunne ikke leses. Last siden på nytt og prøv igjen.');
  }
  const fields = Object.create(null);
  for (const [name, value] of entries) {
    if (typeof value !== 'string') throw new RequestError(400, 'Vedlegg og sammensatte felt støttes ikke i dette skjemaet.');
    if (value.length > MAX_FIELD_LENGTH) throw new RequestError(400, 'Et felt er for langt. Kort ned teksten og prøv igjen.');
    if (Object.hasOwn(fields, name)) throw new RequestError(400, 'Skjemaet inneholder et duplisert felt.');
    fields[name] = value.trim();
  }
  return fields;
}

function safeSourceUrl(request, allowedOrigins, fallback) {
  try {
    const referer = new URL(request.headers.get('referer'));
    if (allowedOrigins.has(referer.origin) && !referer.username && !referer.password) {
      // Query strings and fragments can contain personal data; keep only origin and pathname.
      return `${referer.origin}${referer.pathname}`;
    }
  } catch { /* Missing or malformed Referer uses canonical site URL. */ }
  return `${new URL(fallback).origin}${new URL(fallback).pathname}`;
}

async function mutation(config, mutations, dependencies) {
  const url = `https://${config.projectId}.api.sanity.io/${API_VERSION}/data/mutate/${config.dataset}?visibility=sync&returnIds=true`;
  const result = await dependencies.fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mutations }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!result.ok) throw new Error('Storage request failed');
  const body = await result.json();
  if (!body || typeof body.transactionId !== 'string' || !Array.isArray(body.results)) throw new Error('Storage acknowledgement missing');
  return body;
}

async function forwardEmail(form, fields, document, dependencies) {
  const payload = {
    ...fields,
    ...(document.senderEmail ? { email: document.senderEmail } : {}),
    _subject: form.title,
    _url: document.sourceUrl,
    _captcha: 'false',
    ...(form.cc ? { _cc: form.cc.split(/[,;]/).map((email) => email.trim()).join(',') } : {}),
  };
  try {
    const result = await dependencies.fetch(`https://formsubmit.co/ajax/${encodeURIComponent(form.recipient)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', referer: document.sourceUrl },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!result.ok) return false;
    const body = await result.json();
    return body?.success === true || body?.success === 'true';
  } catch { return false; }
}

/** Server-only handler. The optional dependencies object makes all outbound I/O replaceable in tests. */
export async function handleFormRequest(request, config, overrides = {}) {
  if (request.method !== 'POST') return response(request, 405, 'Dette endepunktet tar bare imot skjemaer.', { allow: 'POST' });
  const dependencies = getDependencies(overrides);
  let canonicalOrigin;
  let selected;
  let document;
  let fields;
  try {
    canonicalOrigin = validateConfig(config);
    const requestUrl = new URL(request.url);
    const requestOrigin = trustedRequestOrigin(requestUrl, canonicalOrigin, dependencies, config.allowedOrigins);
    const origin = request.headers.get('origin');
    const allowedOrigins = new Set([canonicalOrigin, ...(config.allowedOrigins || []), ...(requestOrigin ? [requestOrigin] : [])]);
    if (!requestOrigin || !origin || !allowedOrigins.has(origin)) throw new RequestError(403, 'Skjemaet må sendes fra nettstedet vårt. Last kontaktsiden på nytt og prøv igjen.');
    selected = formConfig(requestUrl, config);
    // Redirect only to the validated origin serving this request, preserving preview deployments.
    selected.successUrl = new URL(`${selected.successUrl.pathname}${selected.successUrl.search}${selected.successUrl.hash}`, requestOrigin);
    const input = await parseFields(request);
    if ([...HONEYPOTS].some((name) => input[name])) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    fields = Object.create(null);
    for (const name of selected.form.allowedFields) if (Object.hasOwn(input, name)) fields[name] = input[name];
    if (selected.form.requiredFields.some((name) => !fields[name])) throw new RequestError(400, 'Fyll ut alle obligatoriske felt.');
    const senderEmail = selected.form.emailField ? fields[selected.form.emailField] || '' : '';
    if (senderEmail && !isEmail(senderEmail)) throw new RequestError(400, 'Skriv inn en gyldig e-postadresse.');
    const uuid = typeof input.submissionId === 'string' && UUID.test(input.submissionId) ? input.submissionId.toLowerCase() : randomUUID();
    document = {
      _id: `formSubmission.${uuid}`,
      _type: 'formSubmission',
      receivedAt: new Date().toISOString(),
      formId: selected.id,
      formTitle: selected.form.title,
      sourceUrl: safeSourceUrl(request, allowedOrigins, config.siteUrl),
      senderName: (selected.form.nameFields || []).map((name) => fields[name] || '').filter(Boolean).join(' '),
      senderEmail,
      fields: Object.entries(fields).map(([name, value]) => ({ _type: 'submissionField', _key: randomUUID(), name, value })),
      status: 'new',
      emailStatus: 'pending',
    };
  } catch (error) {
    if (error instanceof RequestError) return response(request, error.status, error.message);
    return response(request, 503, SAVE_ERROR);
  }

  let created;
  try {
    const saved = await mutation(config, [{ createIfNotExists: document }], dependencies);
    // The live Sanity API acknowledges an existing createIfNotExists ID as `update`.
    // Some adapters use `none`; only the winning `create` is allowed to send email.
    // Unknown/malformed acknowledgements fail closed instead of risking duplicate notifications.
    if (saved.results.length !== 1) throw new Error('Ambiguous storage acknowledgement');
    const result = saved.results[0];
    if ((result.id || result.documentId) !== document._id || !['create', 'none', 'update'].includes(result.operation)) throw new Error('Unexpected storage acknowledgement');
    created = result.operation === 'create';
  } catch {
    return response(request, 503, SAVE_ERROR);
  }

  if (created) {
    const sent = await forwardEmail(selected.form, fields, document, dependencies);
    try {
      await mutation(config, [{ patch: { id: document._id, set: { emailStatus: sent ? 'sent' : 'failed' } } }], dependencies);
    } catch {
      // The inbox is already durable. A pending status indicates that acknowledgement needs review.
      // Do not log payloads, credentials, email addresses, or provider error bodies.
    }
  }
  if (wantsJson(request)) return response(request, 200, SAVED_MESSAGE);
  return new Response(null, { status: 303, headers: { location: selected.successUrl.href, 'cache-control': 'no-store' } });
}

/** Adapter for Vercel Node functions and plain Node HTTP servers. */
export async function handleNodeFormRequest(req, res, config, overrides = {}) {
  let request;
  try {
    const dependencies = getDependencies(overrides);
    const canonical = new URL(config.siteUrl);
    const host = Array.isArray(req.headers.host) ? '' : req.headers.host;
    const local = host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) && dependencies.environment !== 'production';
    const candidate = new URL(req.url || '/', `${local ? 'http:' : 'https:'}//${host || canonical.host}`);
    validateConfig(config);
    if (!trustedRequestOrigin(candidate, canonical.origin, dependencies, config.allowedOrigins)) throw new RequestError(403, 'Ugyldig vertsnavn.');
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    let bytes;
    if (req.method === 'POST') {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string') bytes = new TextEncoder().encode(req.body);
        else if (req.body instanceof Uint8Array) bytes = req.body;
        else { bytes = new TextEncoder().encode(JSON.stringify(req.body)); headers.set('content-type', 'application/json'); }
        if (bytes.byteLength > MAX_BODY_BYTES) throw new RequestError(413, 'Skjemaet er for stort. Kort ned teksten og prøv igjen.');
      } else {
        const chunks = [];
        let size = 0;
        const length = headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new RequestError(413, 'Skjemaet er for stort. Kort ned teksten og prøv igjen.');
        for await (const chunk of req) {
          const part = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
          size += part.byteLength;
          if (size > MAX_BODY_BYTES) throw new RequestError(413, 'Skjemaet er for stort. Kort ned teksten og prøv igjen.');
          chunks.push(part);
        }
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
      }
    }
    request = new Request(candidate, { method: req.method || 'GET', headers, ...(bytes ? { body: bytes } : {}) });
  } catch (error) {
    const fallbackRequest = new Request('https://localhost/', { headers: { accept: typeof req.headers.accept === 'string' ? req.headers.accept : '' } });
    const result = response(fallbackRequest, error instanceof RequestError ? error.status : 503, error instanceof RequestError ? error.message : SAVE_ERROR);
    res.statusCode = result.status;
    result.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await result.text());
    return;
  }
  const result = await handleFormRequest(request, config, overrides);
  res.statusCode = result.status;
  result.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await result.text());
}
