import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const start = source.indexOf('function submitFormHandoff(result) {');
const end = source.indexOf('// End provider handoff', start);
assert.ok(start >= 0 && end > start);
const helper = source.slice(start, end);
const accepted = {success: true, delivery: 'handoff_required', handoff: {action: 'https://formsubmit.co/office@example.test', method: 'POST', fields: {name: '<img src=x onerror=alert(1)>', message: 'Hello & goodbye', submit: 'named control'}}};

function browser() {
  const forms = [];
  let posts = 0;
  class NativeForm {
    constructor() { this.children = []; this.attributes = {}; this.submit = 'named input'; }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(input) { this.children.push(input); }
    submit() { posts++; }
  }
  const document = {
    getElementById: (id) => forms.find((form) => form.id === id),
    createElement: (tag) => tag === 'form' ? new NativeForm() : {},
    body: {appendChild: (form) => forms.push(form)},
  };
  const handoff = runInNewContext(helper + '\nsubmitFormHandoff;', {document, URL, HTMLFormElement: NativeForm});
  return {handoff, forms, posts: () => posts};
}

test('JSON handoff constructs text-valued native controls and posts only once', () => {
  const ui = browser();
  assert.equal(ui.handoff(accepted), true);
  assert.equal(ui.forms.length, 1);
  assert.equal(ui.posts(), 1);
  assert.equal(ui.forms[0].attributes.action, accepted.handoff.action);
  assert.equal(ui.forms[0].attributes.method, 'POST');
  assert.deepEqual(Object.fromEntries(ui.forms[0].children.map((input) => [input.name, input.value])), accepted.handoff.fields);
  assert.equal(ui.handoff(accepted), true);
  assert.equal(ui.posts(), 1);
});

test('stored-only acknowledgements never create or post a provider form', () => {
  const ui = browser();
  assert.equal(ui.handoff({success: true, delivery: 'stored_only', replayed: true}), false);
  assert.equal(ui.handoff({success: true, delivery: 'stored_only', replayed: false}), false);
  assert.equal(ui.forms.length, 0);
  assert.equal(ui.posts(), 0);
});

test('untrusted targets, methods, fields and ambiguous success fail before creating any form', () => {
  const ui = browser();
  for (const action of ['http://formsubmit.co/office@example.test', 'https://formsubmit.co.evil.test/office@example.test', 'https://other.test/office@example.test', 'https://user@formsubmit.co/office@example.test', 'https://formsubmit.co/ajax/office@example.test', 'https://formsubmit.co/office@example.test?redirect=evil', 'https://formsubmit.co/office@example.test#evil', 'javascript:alert(1)']) {
    assert.throws(() => ui.handoff({...accepted, handoff: {...accepted.handoff, action}}));
  }
  for (const handoff of [{...accepted.handoff, method: 'GET'}, {...accepted.handoff, fields: {name: {nested: true}}}, {...accepted.handoff, fields: []}, {...accepted.handoff, fields: {}}]) {
    assert.throws(() => ui.handoff({...accepted, handoff}));
  }
  assert.throws(() => ui.handoff({success: true}));
  assert.throws(() => ui.handoff({success: false, delivery: 'stored_only'}));
  assert.equal(ui.forms.length, 0);
  assert.equal(ui.posts(), 0);
});

