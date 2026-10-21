-- VN2: manueller, quellengestützter Zeitnachweis zu einem konkreten Vertragsbeitritt.
-- Keine Übernahme in Stammdaten, keine automatischen Versorgungsfreigaben.
create table if not exists public.vn_contract_accession_proofs (
  proof_id uuid primary key default gen_random_uuid(),
  accession_id text not null references public.site_contract_eligibility(accession_id),
  source_upload_id uuid not null references public.contract_uploads(upload_id),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  proof_kind text not null check (proof_kind in ('BEITRITT','KUENDIGUNG','EINSCHRAENKUNG')),
  effective_from date not null,
  effective_to date,
  pg text not null default '' check (pg='' or pg ~ '^[0-9]{2}$'),
  source_page integer not null check (source_page between 1 and 250),
  source_excerpt text not null check (length(trim(source_excerpt)) between 25 and 1500),
  evidence_note text not null check (length(trim(evidence_note)) between 40 and 2000),
  status text not null default 'DRAFT' check (status in ('DRAFT','VERIFIED')),
  created_by uuid not null,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vn_accession_proof_period check (effective_to is null or effective_to>=effective_from),
  constraint vn_accession_proof_verified check(
    status <> 'VERIFIED' or (verified_by is not null and verified_at is not null)
  ),
  constraint vn_accession_proof_unique unique(accession_id,source_upload_id,proof_kind,effective_from,pg)
);
create index if not exists vn_accession_proofs_source_idx
  on public.vn_contract_accession_proofs(source_upload_id,accession_id,status);
alter table public.vn_contract_accession_proofs enable row level security;
revoke all on public.vn_contract_accession_proofs from public,anon,authenticated;
grant select,insert,update on public.vn_contract_accession_proofs to service_role;

create or replace function public.vn_save_accession_proof(
  p_accession_id text,
  p_source_upload_id uuid,
  p_details jsonb,
  p_verify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_accession public.site_contract_eligibility%rowtype;
  v_upload public.contract_uploads%rowtype;
  v_proof public.vn_contract_accession_proofs%rowtype;
  v_kind text;
  v_pg text;
  v_from date;
  v_to date;
  v_page integer;
  v_excerpt text;
  v_note text;
begin
  if v_uid is null or not exists(
    select 1 from public.vn_users where auth_user_id=v_uid and active=true and role='ADMIN'
  ) then raise exception 'Aktive ADMIN-Berechtigung erforderlich'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then
    raise exception 'Nachweisfelder fehlen'; end if;
  v_kind := upper(trim(coalesce(p_details->>'proof_kind','')));
  v_pg := trim(coalesce(p_details->>'pg',''));
  v_excerpt := trim(coalesce(p_details->>'source_excerpt',''));
  v_note := trim(coalesce(p_details->>'evidence_note',''));
  if v_kind not in ('BEITRITT','KUENDIGUNG','EINSCHRAENKUNG') then
    raise exception 'Ungültige Nachweisart'; end if;
  if v_pg<>'' and v_pg !~ '^[0-9]{2}$' then
    raise exception 'Ungültige Produktgruppe'; end if;
  if coalesce(p_details->>'effective_from','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Gültigkeitsbeginn erforderlich'; end if;
  v_from := (p_details->>'effective_from')::date;
  if nullif(p_details->>'effective_to','') is not null then
    v_to := (p_details->>'effective_to')::date;
  end if;
  if v_to is not null and v_to<v_from then
    raise exception 'Gültigkeitsende liegt vor dem Beginn'; end if;
  if coalesce(p_details->>'source_page','') !~ '^[0-9]{1,3}$' then
    raise exception 'Originalseite fehlt'; end if;
  v_page := (p_details->>'source_page')::integer;
  if v_page<1 or v_page>250 then raise exception 'Originalseite ungültig'; end if;
  if length(v_excerpt)<25 or length(v_excerpt)>1500 or length(v_note)<40 or length(v_note)>2000 then
    raise exception 'Originalauszug (25–1500 Zeichen) und Prüfnotiz (40–2000 Zeichen) sind erforderlich'; end if;
  if p_verify and coalesce(p_details->>'source_checked','false')<>'true' then
    raise exception 'Originaldokument muss ausdrücklich kontrolliert werden'; end if;
  select * into v_accession from public.site_contract_eligibility
    where accession_id=p_accession_id;
  if not found or v_accession.contract_id is null or
    v_accession.contract_match_status<>'EXACT' then
    raise exception 'Vertragsbeitritt nicht eindeutig einem Vertrag zugeordnet'; end if;
  select * into v_upload from public.contract_uploads
    where upload_id=p_source_upload_id and contract_id=v_accession.contract_id;
  if not found or v_upload.storage_path is null
    or v_upload.source_sha256 !~ '^[a-f0-9]{64}$'
    or lower(coalesce(v_upload.filename,'')) !~ '\.pdf$'
    or v_upload.upload_status in ('REJECTED','ERROR','BASELINE') then
    raise exception 'Kein gültiges PDF-Original zum selben Vertrag vorhanden'; end if;

  insert into public.vn_contract_accession_proofs as dest(
    accession_id,source_upload_id,source_sha256,proof_kind,
    effective_from,effective_to,pg,source_page,
    source_excerpt,evidence_note,status,created_by,verified_by,verified_at
  ) values (
    p_accession_id,p_source_upload_id,v_upload.source_sha256,v_kind,
    v_from,v_to,v_pg,v_page,v_excerpt,v_note,
    case when p_verify then 'VERIFIED' else 'DRAFT' end,
    v_uid,case when p_verify then v_uid else null end,
    case when p_verify then now() else null end
  )
  on conflict(accession_id,source_upload_id,proof_kind,effective_from,pg)
  do update set effective_to=excluded.effective_to,
    source_page=excluded.source_page,source_excerpt=excluded.source_excerpt,
    evidence_note=excluded.evidence_note,
    status=excluded.status,verified_by=excluded.verified_by,
    verified_at=excluded.verified_at,updated_at=now()
  where dest.status='DRAFT'
  returning * into v_proof;
  if not found then
    raise exception 'Bereits verifizierter Nachweis ist unveränderlich; neue Quelle oder neuen Zeitraum verwenden'; end if;
  return jsonb_build_object(
    'proof_id',v_proof.proof_id,'accession_id',v_proof.accession_id,
    'status',v_proof.status,'proof_kind',v_proof.proof_kind,
    'effective_from',v_proof.effective_from,'effective_to',v_proof.effective_to,
    'pg',v_proof.pg,'source_page',v_proof.source_page,
    'source_upload_id',v_proof.source_upload_id
  );
end;
$fn$;
revoke all on function public.vn_save_accession_proof(text,uuid,jsonb,boolean) from public,anon;
grant execute on function public.vn_save_accession_proof(text,uuid,jsonb,boolean) to authenticated;
comment on table public.vn_contract_accession_proofs is 'Quellengebundene, rein manuell überprüfte Beitrittszeitnachweise. Keine automatische Versicherungs-/Versorgungsfreigabe.';
