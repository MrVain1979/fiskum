import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { handleFormRequest, handleNodeFormRequest, MAX_BODY_BYTES } from '../lib/form-inbox.mjs';

const ID = 'cf8e3a22-4453-45df-9dbe-d9aa599f429d';
const config = {
  projectId: 'test1234', dataset: 'production', token: 'server-only-test-token', siteUrl: 'https://example.test',
  forms: { contact: { title: 'Ny henvendelse', recipient: 'office@example.test', cc: 'copy@example.test', successPath: '/takk', allowedFields: ['name', 'email', 'message'], requiredFields: ['name', 'email', 'message'], emailField: 'email', nameFields: ['name'] } },
};
const data = (overrides = {}) => ({ name: 'Test Person', email: 'test@example.test', message: 'Testhenvendelse', submissionId: ID, ...overrides });
const request = (overrides = {}) => new Request(overrides.url || 'https://example.test/api/forms?form=contact', {
  method: overrides.method || 'POST',
  headers: { origin: 'https://example.test', accept: 'application/json', 'content-type': 'application/json', referer: 'https://example.test/kontakt?secret=discard#discard', ...overrides.headers },
  ...((overrides.method || 'POST') === 'POST' ? { body: overrides.body ?? JSON.stringify(data()) } : {}),
});

function transport(options = {}) {
  const calls = [];
  const documents = new Map();
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    assert.ok(String(url).startsWith('https://test1234.api.sanity.io/'), 'the server may only contact storage');
    assert.equal(init.headers.authorization, 'Bearer server-only-test-token');
    assert.ok(String(url).includes('visibility=sync'));
    const mutation = JSON.parse(init.body).mutations[0];
    assert.ok(mutation.createIfNotExists, 'there are no delivery patches or overwrites');
    if (options.saveFailure) return new Response('storage unavailable', { status: 503 });
    if (options.saveMalformed) return Response.json({ results: [] });
    const document = mutation.createIfNotExists;
    const existing = documents.has(document._id);
    if (!existing) documents.set(document._id, document);
    return Response.json({ transactionId: 'test-tx', results: [{ id: document._id, operation: existing ? options.replayOperation || 'none' : 'create' }] });
  };
  return { fetch, calls, documents };
}

const htmlRequest = (overrides = {}) => request({ ...overrides, headers: { ...overrides.headers, accept: 'text/html' } });
const decodeHtml = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]));
const htmlFields = (html) => Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)].map((match) => [decodeHtml(match[1]), decodeHtml(match[2])]));

test('saves one private document before returning an explicit JSON handoff of allowlisted data', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ body: JSON.stringify(data({ injected: 'ignore', _subject: 'spoof', _next: 'https://evil.test', _url: 'https://evil.test', _cc: 'attacker@evil.test', recipient: 'attacker@evil.test', _id: 'public-id' })) }), config, io);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.success, true);
  assert.equal(body.delivery, 'handoff_required');
  assert.equal(body.message, 'Henvendelsen er lagret. Overføring til FormSubmit gjenstår.');
  assert.equal(io.calls.length, 1);
  const saved = io.documents.get(`formSubmission.${ID}`);
  assert.equal(saved._type, 'formSubmission');
  assert.equal(saved.emailStatus, 'unconfirmed');
  assert.equal(saved.status, 'new');
  assert.equal(saved.senderName, 'Test Person');
  assert.equal(saved.senderEmail, 'test@example.test');
  assert.equal(saved.sourceUrl, 'https://example.test/kontakt');
  assert.deepEqual(saved.fields.map(({ name, value }) => [name, value]), [['name', 'Test Person'], ['email', 'test@example.test'], ['message', 'Testhenvendelse']]);
  assert.ok(saved.fields.every(({ _key }) => _key));
  assert.ok(saved.fields.every(({ _type }) => _type === 'submissionField'));
  assert.deepEqual(body.handoff, { action: 'https://formsubmit.co/office@example.test', method: 'POST', fields: {
    name: 'Test Person', email: 'test@example.test', message: 'Testhenvendelse', _subject: 'Ny henvendelse', _url: 'https://example.test/kontakt', _next: 'https://example.test/takk', _template: 'table', _captcha: 'false', _cc: 'copy@example.test',
  } });
  assert.ok(!JSON.stringify(body).includes(config.token));
  assert.ok(!JSON.stringify(body).includes(saved._id));
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('HTML handoff posts natively, has a no-JS submit button and a strict per-response nonce policy', async () => {
  const io = transport();
  const result = await handleFormRequest(htmlRequest(), config, io);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, noarchive');
  const html = await result.text();
  assert.match(html, /<form id="formsubmit-handoff" action="https:\/\/formsubmit.co\/office@example.test" method="post" accept-charset="UTF-8">/);
  assert.match(html, /<button id="formsubmit-send" type="submit">Send meldingen<\/button>/);
  assert.match(html, /<noscript>.*Trykk på «Send meldingen».*<\/noscript>/);
  const nonce = html.match(/<script nonce="([A-Za-z0-9+/=]+)">/)[1];
  assert.equal(result.headers.get('content-security-policy'), `default-src 'none'; script-src 'nonce-${nonce}'; form-action https://formsubmit.co https://example.test; base-uri 'none'; frame-ancestors 'none'`);
  assert.equal(io.calls.length, 1);
  assert.ok(!html.includes(config.token));
  const second = await handleFormRequest(htmlRequest({ body: JSON.stringify(data({ submissionId: 'be4520eb-f92f-4d6a-bd54-679b2562db4e' })) }), config, io);
  assert.ok(!second.headers.get('content-security-policy').includes(nonce), 'each response needs an unpredictable nonce');
});

test('HTML escapes field values and names without interpolating user data into executable script', async () => {
  const hostile = '\"><script>alert(1)</script></form><img src=x onerror=alert(1)>&\'';
  const hostileName = 'label\" autofocus onfocus=alert(1) &';
  const custom = { ...config, forms: { contact: { ...config.forms.contact, allowedFields: [...config.forms.contact.allowedFields, hostileName] } } };
  const io = transport();
  const result = await handleFormRequest(htmlRequest({ body: JSON.stringify(data({ name: hostile, message: hostile, [hostileName]: hostile })) }), custom, io);
  const html = await result.text();
  assert.ok(!html.includes(hostile));
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal((html.match(/<\/form>/g) || []).length, 1);
  assert.ok(!html.includes('<img'));
  const fields = htmlFields(html);
  assert.equal(fields.name, hostile);
  assert.equal(fields.message, hostile);
  assert.equal(fields[hostileName], hostile);
  assert.ok(!html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1].includes('alert'));
});

test('automatic native submit survives named controls and blocks another submit event', async () => {
  const io = transport();
  const custom = { ...config, forms: { contact: { ...config.forms.contact, allowedFields: [...config.forms.contact.allowedFields, 'submit', 'addEventListener'] } } };
  const result = await handleFormRequest(htmlRequest({ body: JSON.stringify(data({ submit: 'clobber', addEventListener: 'clobber' })) }), custom, io);
  const script = (await result.text()).match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  let submissions = 0;
  class NativeForm extends EventTarget { submit() { submissions++; } }
  const form = new NativeForm();
  form.submit = 'named input';
  form.addEventListener = 'named input';
  const button = { disabled: false };
  runInNewContext(script, { document: { getElementById: (id) => ({ 'formsubmit-handoff': form, 'formsubmit-send': button })[id] }, HTMLFormElement: NativeForm, EventTarget });
  assert.equal(submissions, 1);
  assert.equal(button.disabled, true);
  const duplicate = new Event('submit', { cancelable: true });
  form.dispatchEvent(duplicate);
  assert.equal(duplicate.defaultPrevented, true);
  assert.equal(submissions, 1);
});

test('storage failure is fail closed: 503 and no handoff', async () => {
  const io = transport({ saveFailure: true });
  const result = await handleFormRequest(request(), config, io);
  assert.equal(result.status, 503);
  assert.match((await result.json()).message, /kunne ikke lagres/);
  assert.equal(io.calls.length, 1);
});

test('ambiguous storage acknowledgement never releases handoff data', async () => {
  const io = transport({ saveMalformed: true });
  const result = await handleFormRequest(request(), config, io);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).handoff, undefined);
  assert.equal(io.calls.length, 1);
});

test('idempotent JSON replay preserves first content and provides no second handoff', async () => {
  const io = transport();
  assert.equal((await (await handleFormRequest(request(), config, io)).json()).delivery, 'handoff_required');
  const replay = await handleFormRequest(request({ body: JSON.stringify(data({ message: 'Changed replay' })) }), config, io);
  const body = await replay.json();
  assert.deepEqual(body, { success: true, delivery: 'stored_only', message: 'Takk! Henvendelsen din er mottatt.', replayed: true });
  assert.equal(io.documents.size, 1);
  assert.equal(io.calls.length, 2);
  assert.equal(io.documents.get(`formSubmission.${ID}`).fields.find(({ name }) => name === 'message').value, 'Testhenvendelse');
});

test('concurrent idempotent saves issue only one browser handoff', async () => {
  const io = transport();
  const results = await Promise.all([handleFormRequest(request(), config, io), handleFormRequest(request(), config, io)]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(io.documents.size, 1);
  const bodies = await Promise.all(results.map((result) => result.json()));
  assert.equal(bodies.filter((body) => body.delivery === 'handoff_required').length, 1);
  assert.equal(bodies.filter((body) => body.replayed === true).length, 1);
  assert.equal(io.calls.length, 2);
});

test('real Sanity update acknowledgement replays without overwriting content or repeating the native handoff', async () => {
  const io = transport({ replayOperation: 'update' });
  const first = await handleFormRequest(htmlRequest(), config, io);
  const original = structuredClone(io.documents.get(`formSubmission.${ID}`));
  const replay = await handleFormRequest(htmlRequest({ body: JSON.stringify(data({ name: 'Changed replay name', email: 'changed@example.test', message: 'Changed replay body' })) }), config, io);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 303);
  assert.equal(replay.headers.get('location'), 'https://example.test/takk');
  assert.equal(await replay.text(), '');
  assert.deepEqual(io.documents.get(`formSubmission.${ID}`), original);
  assert.equal(io.calls.length, 2, 'each save may only perform its createIfNotExists mutation');
});

test('forged, missing and null Origin are forbidden without I/O', async () => {
  for (const origin of ['https://evil.test', 'null', 'https://example.test.evil.test', '']) {
    const io = transport();
    assert.equal((await handleFormRequest(request({ headers: { origin } }), config, io)).status, 403);
    assert.equal(io.calls.length, 0);
  }
});

test('request host cannot grant access simply by matching a forged Origin', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ url: 'https://evil.test/api/forms', headers: { origin: 'https://evil.test' } }), config, io);
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('x-nextcode-form-transport'), 'browser-post-v1');
  assert.equal(io.calls.length, 0);
});

test('exact environment-validated Vercel preview gets its own fixed handoff return URL', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ url: 'https://preview-123.vercel.app/api/forms', headers: { origin: 'https://preview-123.vercel.app', accept: 'text/html' } }), config, { ...io, vercelUrl: 'preview-123.vercel.app' });
  assert.equal(result.status, 200);
  assert.equal(htmlFields(await result.text())._next, 'https://preview-123.vercel.app/takk');
  assert.ok(result.headers.get('content-security-policy').includes('form-action https://formsubmit.co https://preview-123.vercel.app;'));
  assert.equal((await handleFormRequest(request({ url: 'https://other.vercel.app/api/forms', headers: { origin: 'https://other.vercel.app' } }), config, { ...io, vercelUrl: 'preview-123.vercel.app' })).status, 403);
});

test('body limit applies without Content-Length and before JSON parsing', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }), config, io);
  assert.equal(result.status, 413);
  assert.equal(io.calls.length, 0);
});

test('explicit www origin works without granting arbitrary request hosts', async () => {
  const wwwConfig = { ...config, allowedOrigins: ['https://www.example.test'] };
  const io = transport();
  const result = await handleFormRequest(request({ url: 'https://www.example.test/api/forms', headers: { origin: 'https://www.example.test', accept: 'text/html' } }), wwwConfig, io);
  assert.equal(result.status, 200);
  assert.equal(htmlFields(await result.text())._next, 'https://www.example.test/takk');
  assert.equal((await handleFormRequest(request({ url: 'https://attacker.test/api/forms', headers: { origin: 'https://attacker.test' } }), wwwConfig, io)).status, 403);
  for (const allowedOrigins of [['https://*.example.test'], ['https://www.example.test/path'], ['https://www.example.test/'], ['https://www.example.test?foo']]) {
    const invalid = await handleFormRequest(request(), { ...config, allowedOrigins }, io);
    assert.equal(invalid.status, 503);
  }
});

test('exact Vercel production alias is allowed from trusted environment only', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ url: 'https://my-project.vercel.app/api/forms', headers: { origin: 'https://my-project.vercel.app' } }), config, { ...io, productionUrl: 'my-project.vercel.app', environment: 'production' });
  assert.equal(result.status, 200);
  const forged = await handleFormRequest(request({ url: 'https://evil.vercel.app/api/forms', headers: { origin: 'https://evil.vercel.app' } }), config, { ...io, productionUrl: 'my-project.vercel.app', environment: 'production' });
  assert.equal(forged.status, 403);
});

test('streamed body is bounded across chunks even with a falsely low Content-Length', async () => {
  const io = transport();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(40000)); controller.enqueue(new Uint8Array(40000)); controller.close(); } });
  const streamed = new Request('https://example.test/api/forms', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json', 'content-length': '10', accept: 'application/json' }, body: stream, duplex: 'half' });
  assert.equal((await handleFormRequest(streamed, config, io)).status, 413);
  assert.equal(io.calls.length, 0);
});

test('GET cannot list inbox contents and performs no outbound request', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ method: 'GET' }), config, io);
  assert.equal(result.status, 405);
  assert.equal(result.headers.get('allow'), 'POST');
  assert.equal(io.calls.length, 0);
});

test('honeypot is silently ignored without saving or forwarding personal data', async () => {
  const io = transport();
  assert.equal((await handleFormRequest(request({ body: JSON.stringify(data({ _honey: 'spam' })) }), config, io)).status, 204);
  assert.equal(io.calls.length, 0);
});

test('bad email, missing fields, nested values and oversized fields are rejected', async () => {
  for (const input of [data({ email: 'bad\r\nBcc: someone@example.test' }), data({ name: ' ' }), data({ message: { injected: true } }), data({ message: 'x'.repeat(10001) })]) {
    const io = transport();
    assert.equal((await handleFormRequest(request({ body: JSON.stringify(input) }), config, io)).status, 400);
    assert.equal(io.calls.length, 0);
  }
});

test('urlencoded and multipart fields work; multipart files do not', async () => {
  const encoded = transport();
  assert.equal((await handleFormRequest(request({ body: new URLSearchParams(data()).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } }), config, encoded)).status, 200);
  const form = new FormData();
  Object.entries(data()).forEach(([key, value]) => form.append(key, value));
  const multipartRequest = new Request('https://example.test/api/forms', { method: 'POST', headers: { origin: 'https://example.test', accept: 'application/json' }, body: form });
  assert.equal((await handleFormRequest(multipartRequest, config, transport())).status, 200);
  form.append('attachment', new Blob(['private file']), 'secret.txt');
  const attachmentRequest = new Request('https://example.test/api/forms', { method: 'POST', headers: { origin: 'https://example.test', accept: 'application/json' }, body: form });
  const io = transport();
  assert.equal((await handleFormRequest(attachmentRequest, config, io)).status, 400);
  assert.equal(io.calls.length, 0);
});

test('new IDs always live below the private document path, even with hostile supplied IDs', async () => {
  const io = transport();
  await handleFormRequest(request({ body: JSON.stringify(data({ submissionId: 'public-id', _id: 'public', _type: 'page' })) }), config, io);
  const [document] = io.documents.values();
  assert.match(document._id, /^formSubmission\.[0-9a-f-]{36}$/);
  assert.equal(document._type, 'formSubmission');
  // Sanity's unauthenticated reads are restricted to IDs without a dot.
  // This checks the enforced ID invariant, not the remote platform's ACL implementation.
  assert.equal(document._id.includes('.'), true);
});

test('external success URL fails closed and aliases are valid recipients', async () => {
  const bad = { ...config, forms: { contact: { ...config.forms.contact, successPath: 'https://evil.test' } } };
  const io = transport();
  assert.equal((await handleFormRequest(request(), bad, io)).status, 503);
  assert.equal(io.calls.length, 0);
  const aliases = { ...config, forms: { contact: { ...config.forms.contact, recipient: '67343e7ba0a9eba0b7d7d70c5c5b4daa' } } };
  const result = await handleFormRequest(request(), aliases, io);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).handoff.action, 'https://formsubmit.co/67343e7ba0a9eba0b7d7d70c5c5b4daa');
  assert.equal(io.calls.length, 1);
});

test('recipient path encoding preserves literal @ while neutralizing URL delimiters', async () => {
  const custom = { ...config, forms: { contact: { ...config.forms.contact, recipient: "office+tag/'?#&@example.test" } } };
  const result = await handleFormRequest(request(), custom, transport());
  const action = (await result.json()).handoff.action;
  assert.equal(action, 'https://formsubmit.co/office%2Btag%2F%27%3F%23%26@example.test');
  const url = new URL(action);
  assert.equal(url.origin, 'https://formsubmit.co');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
});

test('rebasing a configured double-slash pathname cannot turn the handoff or replay into an external redirect', async () => {
  const custom = { ...config, forms: { contact: { ...config.forms.contact, successPath: 'https://example.test//outside.test/return?sent=1#ok' } } };
  const io = transport();
  const result = await handleFormRequest(request(), custom, io);
  const next = (await result.json()).handoff.fields._next;
  assert.equal(next, 'https://example.test//outside.test/return?sent=1#ok');
  assert.equal(new URL(next).origin, 'https://example.test');
  const replay = await handleFormRequest(htmlRequest(), custom, io);
  assert.equal(replay.status, 303);
  assert.equal(replay.headers.get('location'), next);
});

test('untrusted source URLs are replaced with the canonical URL and cannot reach the handoff', async () => {
  const result = await handleFormRequest(request({ headers: { referer: 'https://evil.test/contact?private=1' } }), config, transport());
  assert.equal((await result.json()).handoff.fields._url, 'https://example.test/');
});

test('Node adapter preserves status/headers and bounds framework-parsed bodies', async () => {
  const io = transport();
  const makeRes = () => ({ statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } });
  const req = { method: 'POST', url: '/api/forms', headers: { host: 'example.test', origin: 'https://example.test', accept: 'application/json', 'content-type': 'application/json' }, body: data() };
  const res = makeRes();
  await handleNodeFormRequest(req, res, config, io);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).success, true);
  const tooBig = makeRes();
  await handleNodeFormRequest({ ...req, body: 'x'.repeat(MAX_BODY_BYTES + 1) }, tooBig, config, io);
  assert.equal(tooBig.statusCode, 413);
});

test("newsletter requires explicit consent and saves an Inbox request without external email", async () => {
  const newsletter = {
    ...config,
    forms: {
      newsletter: {
        title: "Forespørsel om nyhetsbrev",
        forwardEmail: false,
        successPath: "/",
        allowedFields: ["email", "consent"],
        requiredFields: ["email", "consent"],
        requiredValues: { consent: "yes" },
        emailField: "email",
        nameFields: [],
      },
    },
  };
  const make = (consent) =>
    request({
      url: "https://example.test/api/forms?form=newsletter",
      body: JSON.stringify({
        email: "test@example.test",
        consent,
        submissionId: ID,
      }),
    });
  const io = transport();
  for (const consent of [undefined, "no", "true"])
    assert.equal(
      (await handleFormRequest(make(consent), newsletter, io)).status,
      400,
    );
  assert.equal(io.calls.length, 0);
  const accepted = await handleFormRequest(make("yes"), newsletter, io);
  assert.equal(accepted.status, 200);
  const receipt = await accepted.json();
  assert.equal(receipt.delivery, 'stored_only');
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.handoff, undefined);
  assert.equal(io.calls.length, 1);
  assert.equal(
    io.documents.get(`formSubmission.${ID}`).emailStatus,
    "notRequested",
  );
  assert.ok(io.calls.every((call) => !call.url.includes("formsubmit.co")));
});
