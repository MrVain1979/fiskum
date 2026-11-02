const routeTypes=new Set(['homePage','page','service','projectReference','newsPost']);
/** No I/O. Apply only after a complete raw backup, using each ifRevisionID. */
export function plan(documents,{phase='prepare',projectId,dataset}={}){
 if(projectId!=='qgyys6fw'||dataset!=='production')throw new Error('Wrong Fiskum project or dataset');
 if(!Array.isArray(documents)||!['prepare','finalize'].includes(phase))throw new Error('Invalid migration input');
 const changes=[],conflicts=[];
 if(phase==='finalize')return {changes,conflicts,summary:{phase,documents:0}};
 for(const doc of documents){
  if(!routeTypes.has(doc._type)||doc.editorRound2Version>=1||!doc.sections?.some(section=>['contactFormSection','pdfSection','faqAccordion'].includes(section?._type)))continue;
  const set={editorRound2Version:1};
  for(const [index,section]of doc.sections.entries()){
   const path=`sections[${index}]`;
   if(section?._type==='contactFormSection'){
    if(!section.title)set[`${path}.title`]='Send oss en forespørsel';
    if(!section.lead)set[`${path}.lead`]='Har du spørsmål, er du alltid velkommen til å ta kontakt med oss.';
   }
   if(section?._type==='pdfSection'&&!section.title)set[`${path}.title`]='Dokumenter';
   if(section?._type==='faqAccordion'&&section.link&&!section.link.title)set[`${path}.link.title`]='Les mer';
  }
  if(!doc._id||!doc._rev)conflicts.push({id:doc._id,reason:'Raw document id and revision required'});
  else changes.push({id:doc._id,ifRevisionID:doc._rev,set,unset:[]});
 }
 return {changes,conflicts,summary:{phase,documents:changes.length}};
}
