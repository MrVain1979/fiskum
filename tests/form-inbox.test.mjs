import test from 'node:test';
import assert from 'node:assert/strict';
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
    if (String(url).startsWith('https://formsubmit.co/')) {
      assert.ok(documents.size, 'durable save must precede every email attempt');
      if (options.emailThrow) throw new Error('Provider failed');
      if (options.emailHtml) return new Response('<html>error</html>', { status: 200 });
      return Response.json({ success: options.emailSuccess ?? true }, { status: options.emailStatus || 200 });
    }
    assert.equal(init.headers.authorization, 'Bearer server-only-test-token');
    assert.ok(String(url).includes('visibility=sync'));
    const mutation = JSON.parse(init.body).mutations[0];
    if (mutation.createIfNotExists) {
      if (options.saveFailure) return new Response('storage unavailable', { status: 503 });
      if (options.saveMalformed) return Response.json({ results: [] });
      const document = mutation.createIfNotExists;
      const existing = documents.has(document._id);
      if (!existing) documents.set(document._id, document);
      return Response.json({ transactionId: 'test-tx', results: [{ id: document._id, operation: existing ? 'none' : 'create' }] });
    }
    const patch = mutation.patch;
    assert.ok(patch);
    if (options.patchFailure) return new Response('patch failed', { status: 500 });
    Object.assign(documents.get(patch.id), patch.set);
    return Response.json({ transactionId: 'test-patch-tx', results: [{ id: patch.id, operation: 'update' }] });
  };
  return { fetch, calls, documents };
}

test('saves private document before forwarding allowlisted data and confirms email status', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ body: JSON.stringify(data({ injected: 'ignore', _subject: 'spoof', _next: 'https://evil.test', _id: 'public-id' })) }), config, io);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).success, true);
  assert.equal(io.calls.length, 3);
  const saved = io.documents.get(`formSubmission.${ID}`);
  assert.equal(saved._type, 'formSubmission');
  assert.equal(saved.emailStatus, 'sent');
  assert.equal(saved.status, 'new');
  assert.equal(saved.senderName, 'Test Person');
  assert.equal(saved.senderEmail, 'test@example.test');
  assert.equal(saved.sourceUrl, 'https://example.test/kontakt');
  assert.deepEqual(saved.fields.map(({ name, value }) => [name, value]), [['name', 'Test Person'], ['email', 'test@example.test'], ['message', 'Testhenvendelse']]);
  assert.ok(saved.fields.every(({ _key }) => _key));
  assert.ok(saved.fields.every(({ _type }) => _type === 'submissionField'));
  const forwarded = io.calls[1];
  assert.equal(forwarded.url, 'https://formsubmit.co/ajax/office%40example.test');
  assert.equal(forwarded.body._subject, 'Ny henvendelse');
  assert.equal(forwarded.body._cc, 'copy@example.test');
  assert.equal(forwarded.body.injected, undefined);
  assert.equal(forwarded.body.submissionId, undefined);
});

test('storage failure is fail closed: 503 and no email', async () => {
  const io = transport({ saveFailure: true });
  const result = await handleFormRequest(request(), config, io);
  assert.equal(result.status, 503);
  assert.match((await result.json()).message, /kunne ikke lagres/);
  assert.equal(io.calls.length, 1);
});

test('ambiguous storage acknowledgement never sends email', async () => {
  const io = transport({ saveMalformed: true });
  assert.equal((await handleFormRequest(request(), config, io)).status, 503);
  assert.equal(io.calls.length, 1);
});

for (const [description, provider] of [['false JSON', { emailSuccess: 'false' }], ['HTML HTTP 200', { emailHtml: true }], ['exception', { emailThrow: true }], ['HTTP 521', { emailStatus: 521 }]]) {
  test(`email failure (${description}) still succeeds after storage, with failed status`, async () => {
    const io = transport(provider);
    assert.equal((await handleFormRequest(request(), config, io)).status, 200);
    assert.equal(io.documents.get(`formSubmission.${ID}`).emailStatus, 'failed');
  });
}

test('failed status patch cannot change accepted result or cause another email on replay', async () => {
  const io = transport({ patchFailure: true });
  assert.equal((await handleFormRequest(request(), config, io)).status, 200);
  assert.equal((await handleFormRequest(request(), config, io)).status, 200);
  assert.equal(io.calls.filter(({ url }) => url.includes('formsubmit.co')).length, 1);
  assert.equal(io.documents.get(`formSubmission.${ID}`).emailStatus, 'pending');
});

test('idempotent replay preserves first content and sends one email', async () => {
  const io = transport();
  await handleFormRequest(request(), config, io);
  await handleFormRequest(request({ body: JSON.stringify(data({ message: 'Changed replay' })) }), config, io);
  assert.equal(io.documents.size, 1);
  assert.equal(io.calls.filter(({ url }) => url.includes('formsubmit.co')).length, 1);
  assert.equal(io.documents.get(`formSubmission.${ID}`).fields.find(({ name }) => name === 'message').value, 'Testhenvendelse');
});

test('concurrent idempotent replays send only one email', async () => {
  const io = transport();
  const results = await Promise.all([handleFormRequest(request(), config, io), handleFormRequest(request(), config, io)]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(io.documents.size, 1);
  assert.equal(io.calls.filter(({ url }) => url.includes('formsubmit.co')).length, 1);
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
  assert.equal((await handleFormRequest(request({ url: 'https://evil.test/api/forms', headers: { origin: 'https://evil.test' } }), config, io)).status, 403);
  assert.equal(io.calls.length, 0);
});

test('exact environment-validated Vercel preview works and redirects on preview', async () => {
  const io = transport();
  const result = await handleFormRequest(request({ url: 'https://preview-123.vercel.app/api/forms', headers: { origin: 'https://preview-123.vercel.app', accept: 'text/html' } }), config, { ...io, vercelUrl: 'preview-123.vercel.app' });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://preview-123.vercel.app/takk');
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
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://www.example.test/takk');
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
  assert.equal((await handleFormRequest(request(), aliases, io)).status, 200);
  assert.match(io.calls[1].url, /\/67343e7ba0a9eba0b7d7d70c5c5b4daa$/);
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

