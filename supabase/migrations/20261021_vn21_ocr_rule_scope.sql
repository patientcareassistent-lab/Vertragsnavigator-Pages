-- VN 2.1: source-bound OCR rule scope, no implicit wildcards.
create table if not exists public.vn_ocr_rule_scopes (
  candidate_id uuid primary key references public.vn_ocr_rule_candidates(candidate_id) on delete cascade,
  payer_mode text not null default 'UNRESOLVED' check (payer_mode in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')),
  payer text,
  pg_mode text not null default 'UNRESOLVED' check (pg_mode in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')),
  pg text,
  ik_mode text not null default 'UNRESOLVED' check (ik_mode in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')),
  ik text,
  legs_mode text not null default 'UNRESOLVED' check (legs_mode in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')),
  legs text,
  contract_version_id text references public.contract_versions(contract_version_id),
  valid_from date,
  valid_to date,
  evidence_note text not null default '',
  scope_status text not null default 'DRAFT' check (scope_status in ('DRAFT','VERIFIED')),
  verified_by uuid,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint vn_ocr_scope_pair_checks check (
    ((payer_mode='EXACT' and nullif(trim(payer),'') is not null) or (payer_mode<>'EXACT' and payer is null))
    and ((pg_mode='EXACT' and pg ~ '^[0-9]{2}$') or (pg_mode<>'EXACT' and pg is null))
    and ((ik_mode='EXACT' and ik ~ '^[0-9]{9}$') or (ik_mode<>'EXACT' and ik is null))
    and ((legs_mode='EXACT' and legs ~ '^[0-9A-Z]{7,8}$') or (legs_mode<>'EXACT' and legs is null))
    and (valid_to is null or valid_from is not null and valid_to >= valid_from)
    and (scope_status <> 'VERIFIED' or (
       payer_mode <> 'UNRESOLVED' and pg_mode <> 'UNRESOLVED'
       and ik_mode <> 'UNRESOLVED' and legs_mode <> 'UNRESOLVED'
       and contract_version_id is not null and valid_from is not null
       and length(trim(evidence_note)) >= 30
       and verified_by is not null and verified_at is not null
    ))
  )
);
alter table public.vn_ocr_rule_scopes enable row level security;
revoke all on table public.vn_ocr_rule_scopes from public,anon,authenticated;
grant select,insert,update on table public.vn_ocr_rule_scopes to service_role;
comment on table public.vn_ocr_rule_scopes is 'OCR-only confirmed scope, not supply eligibility. All-in-contract must be supported by manual evidence; unresolved never means wildcard.';

create or replace function public.vn_ocr_save_rule_scope(
  p_candidate_id uuid,p_scope jsonb,p_verify boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_candidate public.vn_ocr_rule_candidates%rowtype;
  v_contract public.contracts%rowtype;
  v_version public.contract_versions%rowtype;
  v_payer_mode text := upper(coalesce(p_scope->>'payer_mode','UNRESOLVED'));
  v_pg_mode text := upper(coalesce(p_scope->>'pg_mode','UNRESOLVED'));
  v_ik_mode text := upper(coalesce(p_scope->>'ik_mode','UNRESOLVED'));
  v_legs_mode text := upper(coalesce(p_scope->>'legs_mode','UNRESOLVED'));
  v_payer text := nullif(btrim(coalesce(p_scope->>'payer','')),'');
  v_pg text := nullif(btrim(coalesce(p_scope->>'pg','')),'');
  v_ik text := nullif(btrim(coalesce(p_scope->>'ik','')),'');
  v_legs text := nullif(upper(btrim(coalesce(p_scope->>'legs',''))),'');
  v_version_id text := nullif(btrim(coalesce(p_scope->>'contract_version_id','')),'');
  v_valid_from date;
  v_valid_to date;
  v_note text := btrim(coalesce(p_scope->>'evidence_note',''));
  v_result public.vn_ocr_rule_scopes%rowtype;
begin
  if v_uid is null or not exists (
    select 1 from public.vn_users where auth_user_id=v_uid and active=true and role='ADMIN'
  ) then raise exception 'ADMIN-Berechtigung erforderlich'; end if;
  if p_scope is null or jsonb_typeof(p_scope)<>'object' then
    raise exception 'Ungültiger Geltungsbereich'; end if;
  if length(v_note)>2000 then raise exception 'Prüfnachweis zu lang'; end if;
  if v_payer_mode not in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')
     or v_pg_mode not in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')
     or v_ik_mode not in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED')
     or v_legs_mode not in ('EXACT','ALL_IN_CONTRACT','UNRESOLVED') then
    raise exception 'Ungültiger Geltungsmodus'; end if;
  if v_payer_mode <> 'EXACT' then v_payer:=null; end if;
  if v_pg_mode <> 'EXACT' then v_pg:=null; end if;
  if v_ik_mode <> 'EXACT' then v_ik:=null; end if;
  if v_legs_mode <> 'EXACT' then v_legs:=null; end if;
  if (v_pg_mode='EXACT' and v_pg !~ '^[0-9]{2}$')
    or (v_ik_mode='EXACT' and v_ik !~ '^[0-9]{9}$')
    or (v_legs_mode='EXACT' and v_legs !~ '^[0-9A-Z]{7,8}$')
    or (v_payer_mode='EXACT' and (v_payer is null or length(v_payer)>120)) then
    raise exception 'PG, IK, LEGS oder Kostenträger hat ein ungültiges Format'; end if;
  if length(coalesce(v_version_id,''))>180 then raise exception 'Version-ID zu lang'; end if;
  if nullif(p_scope->>'valid_from','') is not null then
    v_valid_from:=(p_scope->>'valid_from')::date;
  end if;
  if nullif(p_scope->>'valid_to','') is not null then
    v_valid_to:=(p_scope->>'valid_to')::date;
  end if;
  if v_valid_to is not null and (v_valid_from is null or v_valid_to < v_valid_from)
    then raise exception 'Ungültiger Gültigkeitszeitraum'; end if;
  select * into v_candidate from public.vn_ocr_rule_candidates
    where candidate_id=p_candidate_id for update;
  if not found or v_candidate.status in ('REJECTED','SUPERSEDED')
     or v_candidate.knowledge_id is not null then
    raise exception 'OCR-Regelkandidat nicht mehr bearbeitbar'; end if;
  select * into v_contract from public.contracts where contract_id=v_candidate.contract_id;
  if not found then raise exception 'Vertrag nicht vorhanden'; end if;

  if v_version_id is not null then
    select * into v_version from public.contract_versions
      where contract_version_id=v_version_id and contract_id=v_candidate.contract_id;
    if not found then raise exception 'Vertragsversion passt nicht zum Vertrag'; end if;
    if v_valid_from is not null and v_version.valid_from is not null
       and v_valid_from < v_version.valid_from then
      raise exception 'Regelbeginn liegt vor dem Versionsbeginn'; end if;
    if v_valid_to is not null and v_version.valid_to is not null
       and v_valid_to > v_version.valid_to then
      raise exception 'Regelende liegt nach dem Versionsende'; end if;
  end if;

  if p_verify then
    if v_payer_mode='UNRESOLVED' or v_pg_mode='UNRESOLVED'
       or v_ik_mode='UNRESOLVED' or v_legs_mode='UNRESOLVED'
       or v_version_id is null or v_valid_from is null or length(v_note)<30 then
      raise exception 'Für die Geltungsprüfung sind Kostenträger, PG, IK, LEGS, Vertragsversion, Beginn und Quellenbegründung erforderlich. Vertragweit muss ausdrücklich markiert sein.';
    end if;
    if v_payer_mode='EXACT' and cardinality(v_contract.payer_families)>0
      and not exists (select 1 from unnest(v_contract.payer_families) x
        where upper(btrim(x))=upper(v_payer)) then
      raise exception 'Kostenträgerfamilie widerspricht der Vertragsstammdatengruppe'; end if;
    if v_pg_mode='EXACT' and cardinality(v_contract.product_groups)>0
      and not exists (select 1 from unnest(v_contract.product_groups) x
        where lpad(regexp_replace(x,'[^0-9]','','g'),2,'0')=v_pg) then
      raise exception 'Produktgruppe ist dem Vertrag nicht zugeordnet'; end if;
    if v_legs_mode='EXACT' and cardinality(v_contract.legs)>0
      and not exists (
        select 1 from unnest(v_contract.legs) raw,
             regexp_split_to_table(raw,'[,;\s]+') code
        where upper(btrim(code))=v_legs
      ) then raise exception 'LEGS ist im Vertragsstamm nicht belegt'; end if;
    if v_ik_mode='EXACT' and not exists (
      select 1 from public.sites where ik=v_ik and active=true
    ) then raise exception 'IK gehört zu keinem aktiven Standort'; end if;
    -- IK-Standortzugehörigkeit ist KEIN Nachweis über konkreten Vertragsbeitritt.
    -- Die vollständige Vertragsgeltung muss in evidence_note dokumentiert werden.
  end if;
  insert into public.vn_ocr_rule_scopes as sc(
    candidate_id,payer_mode,payer,pg_mode,pg,ik_mode,ik,legs_mode,legs,
    contract_version_id,valid_from,valid_to,evidence_note,
    scope_status,verified_by,verified_at,updated_at
  ) values(
    p_candidate_id,v_payer_mode,v_payer,v_pg_mode,v_pg,v_ik_mode,v_ik,v_legs_mode,v_legs,
    v_version_id,v_valid_from,v_valid_to,v_note,
    case when p_verify then 'VERIFIED' else 'DRAFT' end,
    case when p_verify then v_uid else null end,
    case when p_verify then now() else null end,now()
  )
  on conflict(candidate_id) do update set
    payer_mode=excluded.payer_mode,payer=excluded.payer,
    pg_mode=excluded.pg_mode,pg=excluded.pg,ik_mode=excluded.ik_mode,ik=excluded.ik,
    legs_mode=excluded.legs_mode,legs=excluded.legs,
    contract_version_id=excluded.contract_version_id,
    valid_from=excluded.valid_from,valid_to=excluded.valid_to,
    evidence_note=excluded.evidence_note,
    scope_status=excluded.scope_status,verified_by=excluded.verified_by,
    verified_at=excluded.verified_at,updated_at=now()
  returning * into v_result;
  return jsonb_build_object(
    'candidate_id',v_result.candidate_id,'scope_status',v_result.scope_status,
    'payer_mode',v_result.payer_mode,'payer',v_result.payer,
    'pg_mode',v_result.pg_mode,'pg',v_result.pg,
    'ik_mode',v_result.ik_mode,'ik',v_result.ik,
    'legs_mode',v_result.legs_mode,'legs',v_result.legs,
    'contract_version_id',v_result.contract_version_id,
    'valid_from',v_result.valid_from,'valid_to',v_result.valid_to,
    'evidence_note',v_result.evidence_note
  );
end;
$fn$;
revoke all on function public.vn_ocr_save_rule_scope(uuid,jsonb,boolean) from public,anon;
grant execute on function public.vn_ocr_save_rule_scope(uuid,jsonb,boolean) to authenticated;
comment on function public.vn_ocr_save_rule_scope(uuid,jsonb,boolean) is
  'Active ADMIN confirms documented scope, not actual site contract eligibility; no automatic publication.';
