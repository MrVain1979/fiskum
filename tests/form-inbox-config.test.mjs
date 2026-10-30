import test from 'node:test'
import assert from 'node:assert/strict'
import {formInboxConfig} from '../lib/form-inbox-config.mjs'

test('only an enabled CMS form can accept messages at its configured recipient', async () => {
  const fetcher = async () => Response.json({result: {contactFormEnabled: true, contactEmail: 'office@example.test'}})
  const config = await formInboxConfig({SANITY_FORM_WRITE_TOKEN: 'test-writer'}, fetcher)
  assert.equal(config.projectId, 'qgyys6fw')
  assert.equal(config.forms.contact.recipient, 'office@example.test')
  assert.ok(config.forms.contact.requiredFields.includes('topic'))
})

test('turning the contact form off in CMS also disables the intake API', async () => {
  const config = await formInboxConfig({}, async () => Response.json({result: {contactFormEnabled: false, contactEmail: 'office@example.test'}}))
  assert.deepEqual(config.forms, {})
})

test('CMS failure rejects configuration instead of dropping henvendelser', async () => {
  await assert.rejects(formInboxConfig({}, async () => new Response('', {status: 503})), /unavailable/)
})
