// Conservative source-date assessment; never authorizes supply or contract accession.
const dayOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
export function evaluateTemporalProofs(proofs,{pg='',onDate=''}={}){
  const day=dayOk(onDate)?onDate:new Date().toISOString().slice(0,10);
  const valid=(proofs||[]).filter(p=>p.status==='VERIFIED'&&
    (!p.pg||p.pg===pg));
  const active=valid.filter(p=>p.effective_from<=day&&
    (!p.effective_to||p.effective_to>=day));
  const ended=valid.filter(p=>p.proof_kind==='KUENDIGUNG'&&p.effective_from<=day);
  const restrictions=active.filter(p=>p.proof_kind==='EINSCHRAENKUNG');
  const joined=active.filter(p=>p.proof_kind==='BEITRITT');
  const status=ended.length||restrictions.length?'SOURCE_CONFLICT':
    joined.length?'SOURCE_DATE_DOCUMENTED':'SOURCE_DATE_NOT_PROVEN';
  return {
    on_date:day,status,verified_proofs:valid.length,
    matching_join_proofs:joined.length,
    ending_proofs:ended.length,restriction_proofs:restrictions.length,
    note:'Original-Zeitbezug ist ausschließlich ein Quellennachweis. Status, PG, IK, PQ und aktuelle Vertragsgeltung müssen unabhängig geprüft werden.'
  };
}
