/* Synthetischer Vergleich – nur dedizierter UI-Test-Vite-Build. */
const OPTIONS=[{upload_id:'11111111-1111-4111-8111-111111111111',filename:'BARMER_TK_Rahmenvertrag_2019.pdf',received_at:'2026-09-01T10:00:00Z',same_document:true}];
const CHANGES=[
  {kind:'GEAENDERT',section:'§ 5 Genehmigungsfrist',section_key:'§5#1',category:'GENEHMIGUNG',similarity:.88,
    before:{page:5,end_page:5,text:'Eine Genehmigung muss innerhalb von fünf Werktagen vorliegen.',text_truncated:false},
    after:{page:6,end_page:6,text:'Eine Genehmigung muss innerhalb von sechs Werktagen vorliegen.',text_truncated:false}},
  {kind:'NICHT_GEFUNDEN',section:'§ 7 Dokumentationspflicht',section_key:'§7#1',category:'DOKUMENTATION',similarity:null,
    before:{page:9,end_page:9,text:'Der Leistungserbringer übermittelt alle erforderlichen Unterlagen.',text_truncated:false},
    after:null},
];
const INDEX=[{key:'§5#1',section:'§ 5 Genehmigungsfrist',page:6,end_page:6,category:'GENEHMIGUNG',text:'Eine Genehmigung muss innerhalb von sechs Werktagen vorliegen.',text_truncated:false}];
export async function getContractOcrReview(uploadId,{baselineUploadId='',offset=0,limit=20,category=''}={}){
  const showIndex=baselineUploadId==='NONE';
  const list=(showIndex?INDEX:CHANGES).filter(x=>!category||x.category===category);
  return {
    available:true,upload_id:uploadId,filename:'BARMER_TK_Rahmenvertrag_2026.pdf',
    detected_clauses:4,
    quality:{readable_pages:34,total_pages:34,structured_clauses:4,failed_pages:[],unstructured:false},
    baseline_options:OPTIONS,baseline:showIndex?null:OPTIONS[0],
    comparison:showIndex?null:{added:0,modified:1,uncertain:0,not_found:1,unchanged:2},
    categories:['GENEHMIGUNG','DOKUMENTATION'],
    mode:showIndex?'CLAUSE_INDEX':'COMPARISON',
    results:list.slice(offset,offset+limit),
    pagination:{offset,limit,total:list.length,has_more:offset+limit<list.length},
    warning:'OCR-Textvergleich ist nicht rechtsverbindlich.'
  };
}
export async function getContractUploadOriginalLink(){return {url:'https://example.invalid/test-original.pdf?token=TEST',filename:'TEST.pdf'}}


// Isolierter OCR-Regelkandidaten-Test. Keine Netzwerkzugriffe auf echte Verträge.
let ruleStatus='PENDING',ruleNote='',knowledgeId=null;
const ruleCandidate={
  candidate_id:'33333333-3333-4333-8333-333333333333',
  rule_kind:'GENEHMIGUNG',source_page:6,source_end_page:6,
  clause_key:'§5#1',display_title:'§ 5 Genehmigungsfrist',
  source_excerpt:'Ein Kostenvoranschlag ist innerhalb von sechs Werktagen vorzulegen.',
  proposed_fields:{
    legs_codes:['1234567'],hmv_codes:[],durations_literal:['6 werktagen'],
    amounts_literal_eur:[],source:'OCR_HINWEIS_NICHT_GEPRUEFT'
  },
  ocr_quality:'OCR'
}
export async function getOcrRuleCandidates(_uploadId,{offset=0,limit=25,status='',kind=''}={}){
  const row={...ruleCandidate,status:ruleStatus,review_note:ruleNote,knowledge_id:knowledgeId};
  const list=(!status||status===ruleStatus)&&(!kind||kind===row.rule_kind)?[row]:[];
  return {available:true,candidates:list.slice(offset,offset+limit),
    pagination:{offset,limit,total:list.length,has_more:false},
    can_decide:true,can_draft:true};
}
export async function scanOcrRuleCandidates(){return{generated:1,unchanged_reviews_preserved:true}}
export async function decideOcrRuleCandidate(_uploadId,_candidateId,status,note){
  if(ruleStatus!=='PENDING')throw new Error('Bereits entschieden')
  ruleStatus=status;ruleNote=note;return{candidate:{status,review_note:note}}
}
export async function createOcrKnowledgeDraft(_uploadId,_candidateId,decisionText){
  if(ruleStatus!=='CONFIRMED'||String(decisionText||'').length<20)throw new Error('Fachfreigabe erforderlich')
  knowledgeId='44444444-4444-4444-8444-444444444444';
  return{knowledge_id:knowledgeId,status:'DRAFT'}
}
