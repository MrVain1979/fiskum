import test from 'node:test';
import assert from 'node:assert/strict';
import {plan} from '../scripts/editor-cleanup.mjs';
test('creates one source for each footer label and preserves intentionally empty existing values',()=>{
  const doc={_id:'footer',_rev:'r',_type:'footer',phoneHeading:'',emailHeading:'Kontakt på e-post'};
  const [patch]=plan([doc]);assert.deepEqual(patch.set,{addressHeading:'Adresse',socialHeading:'Følg oss'});
  assert.equal(patch.ifRevisionID,'r');assert.deepEqual(plan([{...doc,...patch.set}]),[]);
});
