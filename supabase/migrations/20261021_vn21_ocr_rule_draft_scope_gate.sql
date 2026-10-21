-- VN 2.1: Never export OCR knowledge without explicit, verified scope.
create or replace function public.vn_ocr_create_knowledge_draft(
  p_upload_id uuid, p_candidate_id uuid, p_decision_text text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_candidate public.vn_ocr_rule_candidates%rowtype;
  v_scope public.vn_ocr_rule_scopes%rowtype;
  v_upload public.contract_uploads%rowtype;
  v_knowledge_id uuid;
  v_text text := btrim(coalesce(p_decision_text,''));
begin
  if v_user_id is null or not exists (
    select 1 from public.vn_users where auth_user_id=v_user_id and active=true and role='ADMIN'
  ) then raise exception 'Administrative Fachfreigabe erforderlich'; end if;
  if length(v_text)<20 or length(v_text)>2500 then
    raise exception 'Regeltext muss 20 bis 2500 Zeichen umfassen'; end if;

  select * into v_candidate from public.vn_ocr_rule_candidates
    where candidate_id=p_candidate_id and upload_id=p_upload_id for update;
  if not found or v_candidate.status <> 'CONFIRMED'
    or v_candidate.knowledge_id is not null then
    raise exception 'Kandidat nicht bestätigt oder bereits als Entwurf übernommen'; end if;
  select * into v_scope from public.vn_ocr_rule_scopes
    where candidate_id=p_candidate_id and scope_status='VERIFIED' for update;
  if not found then
    raise exception 'Geltungsbereich ist noch nicht ausdrücklich und fachlich bestätigt'; end if;

  select * into v_upload from public.contract_uploads where upload_id=p_upload_id;
  if not found or v_upload.contract_id is distinct from v_candidate.contract_id
    or v_upload.upload_status in ('REJECTED','BASELINE','ERROR') then
    raise exception 'Vertragsupload unzulässig'; end if;
  if coalesce(v_upload.summary->>'ocr_text_storage_path','') <>
    ('derived-ocr/'||p_upload_id::text||'.json') then
    raise exception 'OCR-Quellenlage nicht nachweisbar'; end if;

  insert into public.vn_contract_knowledge(
    title, question_text,decision_text,payer,contract_id,contract_version_id,
    pg,source_id,valid_from,valid_to,status,revalidation_required,created_by
  ) values (
    left(v_candidate.rule_kind||' · '||v_candidate.display_title,200),
    left('OCR-Hinweis: '||coalesce(v_upload.filename,'Original-PDF')||
      ', Originalseite '||v_candidate.source_page::text||
      case when v_candidate.source_end_page<>v_candidate.source_page
        then '–'||v_candidate.source_end_page::text else '' end||
      '. Geltung: Kostenträger='||v_scope.payer_mode||
      ', PG='||v_scope.pg_mode||', IK='||v_scope.ik_mode||
      ', LEGS='||v_scope.legs_mode||
      '; Quelle geprüft: '||v_scope.evidence_note,1800),
    v_text,
    case when v_scope.payer_mode='EXACT' then v_scope.payer else null end,
    v_upload.contract_id,v_scope.contract_version_id,
    case when v_scope.pg_mode='EXACT' then v_scope.pg else null end,
    v_upload.source_id,
    v_scope.valid_from,v_scope.valid_to,
    'DRAFT',true,v_user_id
  ) returning knowledge_id into v_knowledge_id;

  update public.vn_ocr_rule_candidates
  set knowledge_id=v_knowledge_id,updated_at=now()
  where candidate_id=p_candidate_id;
  return v_knowledge_id;
end;
$fn$;
revoke all on function public.vn_ocr_create_knowledge_draft(uuid,uuid,text) from public,anon;
grant execute on function public.vn_ocr_create_knowledge_draft(uuid,uuid,text) to authenticated;
comment on function public.vn_ocr_create_knowledge_draft(uuid,uuid,text) is
  'ADMIN + CONFIRMED candidate + VERIFIED scope → atomic DRAFT, revalidation_required=true. Never approve automatically.';
