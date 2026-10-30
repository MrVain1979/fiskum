import { defineArrayMember, defineField, defineType } from 'sanity';

/** Server-created inbox documents must retain the private `formSubmission.<uuid>` ID. */
export default defineType({
  name: 'formSubmission',
  title: 'Henvendelser',
  type: 'document',
  // Inbox status edits save directly without exposing a Publish action.
  liveEdit: true,
  fields: [
    defineField({ name: 'receivedAt', title: 'Mottatt', type: 'datetime', readOnly: true }),
    defineField({ name: 'formId', title: 'Skjema-ID', type: 'string', readOnly: true }),
    defineField({ name: 'formTitle', title: 'Skjema', type: 'string', readOnly: true }),
    defineField({ name: 'sourceUrl', title: 'Sendt fra', type: 'url', readOnly: true }),
    defineField({ name: 'senderName', title: 'Navn', type: 'string', readOnly: true }),
    defineField({ name: 'senderEmail', title: 'E-post', type: 'string', readOnly: true }),
    defineField({
      name: 'fields', title: 'Innsendte opplysninger', type: 'array', readOnly: true,
      of: [defineArrayMember({
        name: 'submissionField', type: 'object',
        fields: [
          defineField({ name: 'name', title: 'Felt', type: 'string', readOnly: true }),
          defineField({ name: 'value', title: 'Verdi', type: 'text', readOnly: true }),
        ],
        preview: { select: { title: 'name', subtitle: 'value' } },
      })],
    }),
    defineField({
      name: 'status', title: 'Oppfølging', type: 'string', initialValue: 'new',
      options: { list: [{ title: 'Ny', value: 'new' }, { title: 'Under behandling', value: 'inProgress' }, { title: 'Ferdig', value: 'done' }], layout: 'radio' },
    }),
    defineField({
      name: 'emailStatus', title: 'E-postvarsling', type: 'string', readOnly: true,
      options: { list: [{ title: 'Avventer', value: 'pending' }, { title: 'Sendt', value: 'sent' }, { title: 'Mislyktes – les henvendelsen her', value: 'failed' }] },
    }),
  ],
  initialValue: { status: 'new' },
  orderings: [{ title: 'Nyeste først', name: 'receivedDesc', by: [{ field: 'receivedAt', direction: 'desc' }] }],
  preview: {
    select: { name: 'senderName', email: 'senderEmail', form: 'formTitle', date: 'receivedAt' },
    prepare({ name, email, form, date }) { return { title: name || email || form || 'Henvendelse', subtitle: [form, date ? new Date(date).toLocaleString('nb-NO') : ''].filter(Boolean).join(' · ') }; },
  },
});
