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
