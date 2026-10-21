// Defensive client validation; the database RPC is always the final authority.
const MODE=['EXACT','ALL_IN_CONTRACT','UNRESOLVED'];
export const SCOPE_AXES=['payer','pg','ik','legs'];

export function ocrScopeIssues(scope,sourceConfirmed=false){
  const issues=[];
  if(!scope||typeof scope!=='object')return ['Geltungsbereich fehlt'];
  for(const key of SCOPE_AXES){
    const mode=scope[key+'_mode']||'UNRESOLVED';
    const value=String(scope[key]||'').trim();
    if(!MODE.includes(mode)||mode==='UNRESOLVED'){
      issues.push(key+': Geltungsart ungeklärt');continue;
    }
    if(mode==='EXACT'){
      const valid=key==='pg'?/^[0-9]{2}$/.test(value):
        key==='ik'?/^[0-9]{9}$/.test(value):
        key==='legs'?/^[0-9A-Z]{7,8}$/.test(value):
        Boolean(value&&value.length<=120);
      if(!valid)issues.push(key+': konkreter Wert ungültig');
    }
  }
  if(!String(scope.contract_version_id||'').trim())issues.push('Vertragsversion fehlt');
  const from=String(scope.valid_from||''),to=String(scope.valid_to||'');
  const validDate=s=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
    const date=new Date(s+'T12:00:00Z');
    return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===s;
  };
  if(!validDate(from))issues.push('Gültig-ab-Datum fehlt oder ungültig');
  if(to&&(!validDate(to)||to<from))issues.push('Gültig-bis-Datum ungültig');
  if(String(scope.evidence_note||'').trim().length<30)issues.push('Quellenbegründung zu kurz');
  if(!sourceConfirmed)issues.push('Quellenprüfung nicht bestätigt');
  return issues;
}
