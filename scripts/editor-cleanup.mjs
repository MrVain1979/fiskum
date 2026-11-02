/** Pure initialization of the four previously hardcoded visible footer headings. */
export function plan(documents, {phase = 'prepare'} = {}) {
  if (!['prepare', 'finalize'].includes(phase)) throw new Error('Expected prepare or finalize');
  if (phase === 'finalize') return [];
  return documents.filter(doc => doc._type === 'footer').flatMap(doc => {
    const set = {};
    for (const [key, value] of Object.entries({phoneHeading: 'Telefon', emailHeading: 'E-post', addressHeading: 'Adresse', socialHeading: 'Følg oss'})) {
      if (!Object.hasOwn(doc, key)) set[key] = value;
    }
    if (!Object.keys(set).length) return [];
    if (!doc._id || !doc._rev) throw new Error('A raw _id and _rev are required');
    return [{id: doc._id, ifRevisionID: doc._rev, set, unset: []}];
  });
}
