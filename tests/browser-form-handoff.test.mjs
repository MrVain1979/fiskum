import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const helper = source.split(/\/\/ FORM_HANDOFF_START\r?\n/)[1].split('// FORM_HANDOFF_END')[0];
const allowed = ['name', 'email', 'message', 'submit'];
const instruction = () => ({success: true, delivery: 'handoff_required', handoff: {action: 'https://formsubmit.co/office@example.test', method: 'POST', fields: {name: '<script>plain text</script>', email: 'sender@example.test', message: 'First & second\nNext line', submit: 'named control', _subject: 'Test subject', _cc: 'copy@example.test', _url: 'https://example.test/contact', _next: 'https://example.test/contact?sent=1', _template: 'table', _captcha: 'false'}}});
const response = (body, ok = true) => ({ok, json: async () => body});
function functions(fetch = async () => {throw new Error('unexpected request')}) {
  return runInNewContext(helper + '\n({submissionIdentity, validateFormHandoff, submitFormHandoff})', {URL, Set, Object, Error, fetch, window: {location: {origin: 'https://example.test'}}, document: {createElement() {throw new Error('native DOM submission is forbidden')}}, HTMLFormElement: {prototype: {submit() {throw new Error('native submit is forbidden')}}}});
}

test('provider AJAX preserves server-owned recipient, CC and fields; only explicit true is accepted', async () => {
  for (const success of [true, 'true']) {
    const calls = [];
    const api = functions(async (url, init) => {calls.push({url, init}); return response({success});});
    const result = instruction();
    assert.equal(await api.submitFormHandoff(result, allowed), 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://formsubmit.co/ajax/office@example.test');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.redirect, 'error');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), result.handoff.fields);
  }
});

test('stored-only receipts never contact the email provider, regardless of replay flag', async () => {
  let calls = 0;
  const api = functions(async () => {calls++;});
  for (const replayed of [true, false]) assert.equal(await api.submitFormHandoff({success: true, delivery: 'stored_only', replayed}, allowed), 'stored_only');
  assert.equal(calls, 0);
});

test('invalid destinations, controls and field injection are refused before provider I/O', async () => {
  let calls = 0;
  const api = functions(async () => {calls++;});
  for (const action of ['http://formsubmit.co/office@example.test', 'https://formsubmit.co.evil.test/office@example.test', 'https://user:pass@formsubmit.co/office@example.test', 'https://formsubmit.co/ajax/office@example.test', 'https://formsubmit.co/office@example.test?x=1', 'https://formsubmit.co/office@example.test#x', 'https://formsubmit.co/office%2F@example.test', 'https://formsubmit.co/not-an-email']) {
    const input = instruction(); input.handoff.action = action;
    await assert.rejects(api.submitFormHandoff(input, allowed));
  }
  for (const patch of [{_next: 'https://evil.test/'}, {_url: 'https://user@example.test/contact'}, {_template: 'box'}, {_captcha: 'true'}, {injected: 'extra'}, {_cc: []}, {name: 'x'.repeat(10001)}]) {
    const input = instruction(); Object.assign(input.handoff.fields, patch);
    await assert.rejects(api.submitFormHandoff(input, allowed));
  }
  await assert.rejects(api.submitFormHandoff({success: true}, allowed));
  await assert.rejects(api.submitFormHandoff({success: false, delivery: 'stored_only'}, allowed));
  const alias = instruction(); alias.handoff.action = 'https://formsubmit.co/0123456789abcdef0123456789abcdef';
  assert.equal(api.validateFormHandoff(alias.handoff, allowed, 'https://example.test').url, 'https://formsubmit.co/ajax/0123456789abcdef0123456789abcdef');
  assert.equal(calls, 0);
});

test('provider HTTP failure, rejection, redirect/network failure and non-JSON responses never confirm sending', async () => {
  for (const provider of [response({success: true}, false), ...[false, 'false', 1, '1', undefined].map(success => response({success})), {ok: true, json: async () => {throw new Error('HTML activation page')}}]) {
    const api = functions(async () => provider);
    await assert.rejects(api.submitFormHandoff(instruction(), allowed), /lagret/);
  }
  await assert.rejects(functions(async () => {throw new Error('redirect refused')}).submitFormHandoff(instruction(), allowed), /lagret/);
});

test('identical values retain their UUID, changed values get a new ID and uploads are rejected', () => {
  const api = functions(); let serial = 0;
  const makeId = () => `test-${++serial}`;
  const first = api.submissionIdentity(new Map([['name', 'Test'], ['message', 'Hello']]), null, makeId);
  assert.equal(api.submissionIdentity(new Map([['name', 'Test'], ['message', 'Hello'], ['submissionId', 'ignored']]), first, makeId), first);
  assert.equal(api.submissionIdentity(new Map([['name', 'Changed'], ['message', 'Hello']]), first, makeId).id, 'test-2');
  assert.throws(() => api.submissionIdentity(new Map([['file', {}]]), first, makeId));
});

function contactPage(options = {}) {
  const ui = {requests: [], resets: 0, focuses: 0, scrolls: 0};
  const classList = () => {const values = new Set(); return {add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value), toggle(value, yes) {if (yes) values.add(value); else values.delete(value);}};};
  const status = {hidden: true, textContent: '', classList: classList(), setAttribute() {}, focus() {ui.focuses++;}, scrollIntoView() {ui.scrolls++;}};
  const button = {disabled: false, textContent: 'Send'};
  const form = {action: `https://example.test/api/forms/${options.newsletter ? 'newsletter' : 'contact'}`, dataset: options.preview ? {previewDisabled: 'true'} : {}, classList: classList(), values: [['name', 'Test'], ['email', 'sender@example.test'], ['message', 'Hello'], ['submit', 'named control']], append(node) {ui.status = node;}, reset() {ui.resets++;}, querySelector(selector) {return selector.includes('submit') ? button : status;}, addEventListener(type, handler) {if (type === 'submit') ui.submit = handler;}};
  if ('successMessage' in options) form.dataset.successMessage = options.successMessage;
  const document = {querySelectorAll: selector => selector === '.contact-form' ? [form] : [], addEventListener() {}, createElement(tag) {if (tag === 'form') throw new Error('No native form submission allowed'); return status;}};
  const local = [...(options.local || [response(instruction())])];
  let serial = 0;
  const fetch = async (url, init) => {
    ui.requests.push({url, init, fields: typeof init.body === 'string' ? JSON.parse(init.body) : Object.fromEntries(init.body)});
    return url.startsWith('https://formsubmit.co/') ? (options.provider || response({success: true})) : local.shift();
  };
  const window = {location: {origin: 'https://example.test', href: 'https://example.test/kontakt', pathname: '/kontakt', search: '', hash: '', assign() {throw new Error('No navigation allowed')}}, history: {replaceState() {}}, addEventListener() {}};
  const context = {URL, URLSearchParams, Set, Object, Error, fetch, window, document, contactForm: form, menuButton: null, nav: null, header: null, revealOnScroll() {}, listen(target, type, handler) {target?.addEventListener(type, handler);}, crypto: {randomUUID: () => `test-${++serial}`}, FormData: class extends Map {constructor(current) {super(current.values)}}, HTMLFormElement: {prototype: {submit() {throw new Error('No native submit allowed')}}}};
  const binding = source.slice(source.indexOf('  for (const contactForm of document.querySelectorAll(".contact-form")) {'), source.indexOf('\n  const reduceMotion'));
  runInNewContext(helper + '\n' + binding, context);
  return {ui, form, button, status};
}

test('submit locks immediately and confirms inline only after both CMS and AJAX provider accept', async () => {
  let release;
  const provider = new Promise(resolve => {release = resolve;});
  const {ui, button, status} = contactPage({provider});
  const first = ui.submit({preventDefault() {}});
  await ui.submit({preventDefault() {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.requests.length, 2, 'one private save and one provider call, with no duplicate click');
  assert.equal(ui.requests[0].init.credentials, 'same-origin');
  assert.equal(ui.requests[0].init.redirect, 'error');
  assert.equal(ui.requests[0].fields.submissionId, 'test-1');
  assert.equal(button.disabled, true);
  assert.equal(ui.resets, 0);
  assert.doesNotMatch(status.textContent, /Takk!|er sendt/);
  release(response({success: true}));
  await first;
  assert.equal(ui.resets, 1);
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /Takk!/);
  assert.equal(status.tabIndex, -1);
  assert.ok(ui.focuses > 0);
  assert.ok(ui.scrolls > 0);
  assert.doesNotMatch(status.textContent, /FormSubmit|Overf/);
});

test('provider failure preserves fields and stable ID; a stored-only retry does not retry email or claim sent', async () => {
  const {ui, button, status} = contactPage({provider: response({success: false}), local: [response(instruction()), response({success: true, delivery: 'stored_only', replayed: true})]});
  await ui.submit({preventDefault() {}});
  assert.equal(ui.resets, 0);
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /lagret/);
  await ui.submit({preventDefault() {}});
  assert.equal(ui.requests.length, 3);
  assert.equal(ui.requests.filter(call => call.url.startsWith('https://formsubmit.co/')).length, 1);
  assert.equal(ui.requests[0].fields.submissionId, ui.requests[2].fields.submissionId);
  assert.equal(ui.resets, 0);
  assert.doesNotMatch(status.textContent, /Takk!|er sendt/);
});

test('private storage failure performs no provider request and keeps form values', async () => {
  const {ui, button} = contactPage({local: [response({success: false}, false)]});
  await ui.submit({preventDefault() {}});
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.resets, 0);
  assert.equal(button.disabled, false);
});

test('newsletter remains CMS-only, never sends provider mail and keeps its fields', async () => {
  const {ui, status} = contactPage({newsletter: true, local: [response({success: true, delivery: 'stored_only', replayed: false})]});
  await ui.submit({preventDefault() {}});
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.resets, 0);
  assert.match(status.textContent, /nyhetsbrev.*lagret/);
  assert.doesNotMatch(status.textContent, /er sendt|Takk!/);
});

test('disabled preview forms perform no CMS or provider request', async () => {
  const {ui} = contactPage({preview: true});
  await ui.submit({preventDefault() {}});
  assert.equal(ui.requests.length, 0);
});

test('missing or whitespace-only CMS customer text still gives a visible generic thank-you', async () => {
  const {ui, status} = contactPage({successMessage: '   '});
  await ui.submit({preventDefault() {}});
  assert.match(status.textContent, /Takk!/);
  assert.ok(ui.focuses > 0);
  assert.ok(ui.scrolls > 0);
});
