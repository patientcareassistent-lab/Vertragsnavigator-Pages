import { supabase } from './supabase.js'

const clean=(value,max)=>String(value||'').trim().slice(0,max)

export async function recordRuntimeEvent({
  severity='ERROR',
  area='APP',
  code='UNKNOWN',
  route=null,
  durationMs=null,
}={}){
  try{
    if(!supabase)return
    const payload={
      severity:['INFO','WARN','ERROR'].includes(severity)?severity:'ERROR',
      area:clean(area,80)||'APP',
      code:clean(code,120)||'UNKNOWN',
      route:route?clean(route,80):null,
      duration_ms:Number.isFinite(Number(durationMs))
        ?Math.max(0,Math.round(Number(durationMs)))
        :null,
    }
    await supabase.from('vn_runtime_events').insert(payload)
  }catch{
    // Telemetrie darf die App niemals blockieren.
  }
}
