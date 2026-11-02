import assert from 'node:assert/strict';
import test from 'node:test';
import {plan} from '../scripts/cms-editor-round2.mjs';
import {documentBody} from '../lib/render-content.mjs';
import {testSettings,projectedLink} from './support/fixtures.mjs';
const options={projectId:'qgyys6fw',dataset:'production',phase:'prepare'};
const fixture=prefix=>({_id:prefix+'page',_rev:'one',_type:'page',title:'Page',slug:'page',sidebarVariant:'none',sections:[{_key:'form',_type:'contactFormSection'},{_key:'pdf',_type:'pdfSection',files:[{title:'A file',url:'https://example.com/test.pdf'}]},{_key:'faq',_type:'faqAccordion',title:'FAQ',faqs:[],link:{url:projectedLink({_type:'page',slug:'another'})}}]});
function apply(docs,changes){const next=structuredClone(docs);for(const change of changes){const doc=next.find(d=>d._id===change.id);assert.equal(doc._rev,change.ifRevisionID);for(const [path,value]of Object.entries(change.set)){const parts=path.replace(/\[(\d+)\]/g,'.$1').split('.');let parent=doc;for(const part of parts.slice(0,-1))parent=parent[part];parent[parts.at(-1)]=structuredClone(value);}}return next;}
const render=doc=>documentBody({settings:{...testSettings,contactFormEnabled:true},document:doc,services:[],references:[],newsPosts:[]},'/page/');

test('prepare retains current effective section copy in all supplied perspectives without mutation',()=>{
 const docs=['','drafts.','versions.release.'].map(fixture),before=structuredClone(docs),result=plan(docs,options);
 assert.deepEqual(docs,before);assert.equal(result.changes.length,3);assert.equal(result.conflicts.length,0);
 const prepared=apply(docs,result.changes);
 for(const doc of prepared){assert.equal(doc.sections[0].title,'Send oss en forespørsel');assert.equal(doc.sections[1].title,'Dokumenter');assert.equal(doc.sections[2].link.title,'Les mer');}
 assert.deepEqual(plan(prepared,options).changes,[]);
 assert.throws(()=>plan(docs,{...options,projectId:'wrong'}),/Wrong/);assert.throws(()=>plan(docs,{...options,dataset:'test'}),/Wrong/);
 assert.equal(plan([{...fixture(''),_rev:undefined}],options).conflicts.length,1);
});

test('actual renderer respects empty/null copy after prepare and never revives it on the next plan',()=>{
 const [doc]=apply([fixture('')],plan([fixture('')],options).changes);
 const baseline=render(doc);for(const text of ['Send oss en forespørsel','Dokumenter','Les mer','Har du spørsmål'])assert.ok(baseline.includes(text));
 doc.sections[0].title='';doc.sections[0].lead=null;doc.sections[1].title='';doc.sections[2].link.title='';
 const cleared=render(doc);for(const text of ['Send oss en forespørsel','Dokumenter','Les mer','Har du spørsmål'])assert.ok(!cleared.includes(text));
 assert.ok(cleared.includes('A file'));assert.ok(cleared.includes('name="message"'),'form interaction labels remain functional');
 assert.deepEqual(plan([doc],options).changes,[]);
});
