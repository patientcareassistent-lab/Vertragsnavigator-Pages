/* Synthetic test data only. Never used by the production Vite build. */
export const supabaseConfigured = true

const contract = {
  contract_id:'ux-fixture-contract',contract_name:'AOK Baden-Württemberg – Mustervertrag',
  payer_families:['AOK'],product_groups:['18'],validity_mode:'SINGLE_SCOPE',
  first_valid_from:'2026-01-01',catalog_valid_to:null
}
const positions = [
  {
    position_row_id:'ux-fixture-green',contract_id:'ux-fixture-contract',
    pg:'18',code:'18.50.03',pos:'1850032',family:'AOK',
    contract:'AOK Baden-Württemberg – Mustervertrag',
    bezeichnung:'Aktivrollstuhl (Testposition)',preis:482.5,
    genehmigung:'Genehmigungsfrei',verordnung:'Erforderlich',
    versorgungsform:'Kauf / Neulieferung'
  },
  {
    position_row_id:'ux-fixture-red',contract_id:'ux-fixture-contract',
    pg:'18',code:'18.50.04',pos:'1850040',family:'AOK',
    contract:'AOK Baden-Württemberg – Mustervertrag',
    bezeichnung:'Rollstuhl mit Ausschluss (Testposition)',preis:625,
    genehmigung:'Genehmigung erforderlich',verordnung:'Erforderlich',
    versorgungsform:'Kauf / Neulieferung'
  }
]
const profile = {active:true,role:'VERSORGER',display_name:'UX Test'}
const session = {user:{id:'ux-fixture-user',user_metadata:{display_name:'UX Test'}}}
const sites = [{site_id:'ux-fixture-site',branch:'Testfiliale',ik:'999999999',active:true}]
const dataFor = (table,head) => {
  const datasets={
    vn_contract_read_model_p2:[contract],
    vn_position_catalog:positions,
    vn_contract_knowledge_approved:[],
    vn_contract_questions_open_p2:[],
    vn_contract_questions:[],
    vn_site_directory:sites,
    vn_site_eligibility:[],
    contract_user_notifications:[],
    vn_contract_version_catalog:[],
    vn_source_document_catalog:[],
    vn_contract_validity_scope:[],
    vn_development_backlog:[],
  }
  const rows=datasets[table]||[]
  return {data:head?null:rows,error:null,count:rows.length}
}
function query(table){
  let head=false
  const q={
    select(_cols,options){head=Boolean(options?.head);return q},
    eq(){return q},neq(){return q},gte(){return q},lte(){return q},
    gt(){return q},lt(){return q},in(){return q},is(){return q},
    or(){return q},contains(){return q},order(){return q},
    limit(){return q},range(){return q},filter(){return q},
    insert(){return Promise.resolve({data:null,error:null})},
    update(){return q},upsert(){return q},delete(){return q},
    single(){return Promise.resolve(table==='vn_users'?{data:profile,error:null}:dataFor(table,head))},
    maybeSingle(){return Promise.resolve(table==='vn_users'?{data:profile,error:null}:{data:dataFor(table,head).data?.[0]||null,error:null})},
    then(resolve,reject){return Promise.resolve(dataFor(table,head)).then(resolve,reject)}
  }
  return q
}
export const supabase={
  auth:{
    async getSession(){return {data:{session},error:null}},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
    async signOut(){return {error:null}}
  },
  from:query,
  async rpc(name,args={}){
    if(name==='vn_search_positions_v13')
      return {data:positions.filter(p=>!args.p_pg||args.p_pg===p.pg),error:null}
    if(name==='evaluate_position_supply_v3'){
      const green=args.p_position_row_id==='ux-fixture-green'
      return {data:{
        decision:green?'GRUEN':'ROT',
        decision_label:green?'Versorgung möglich':'Versorgung nicht möglich',
        decision_basis:green?'Alle Testvoraussetzungen erfüllt.':'Testausschluss wegen fehlender PQ.',
        pq_decision:green?'GRUEN':'ROT',
        accession_decision:green?'GRUEN':'ROT',
        green_scope_count:green?1:0,
        matching_scope_count:green?1:0,
        authorization_decision:green?'GRUEN':'ROT',
        authorization_text:green?'Genehmigungsfrei':'Genehmigung erforderlich',
        prescription_decision:'GRUEN',
        prescription_text:'Verordnung vorhanden',
        source_decision:'GRUEN',
        source_text:'Quelle dokumentiert',
        hard_blockers:green?[]:['PQ fehlt (Testfall)'],
        manual_checks:[],action_items:[],
        validity_text:'Test-Vertragsgültigkeit bestätigt'
      },error:null}
    }
    return {data:[],error:null}
  },
  functions:{async invoke(){return {data:{},error:null}}},
  storage:{from(){return {download:async()=>({data:null,error:null})}}}
}
