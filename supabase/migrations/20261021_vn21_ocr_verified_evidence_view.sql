-- VN 2.1: server-side, read-only OCR reference handoff to future supply evaluation.
-- It is deliberately not a decision or authorization view.
create or replace view public.vn_ocr_verified_evidence_v1
with (security_invoker = true)
as
select
  k.knowledge_id,
  k.contract_id,
  sc.contract_version_id,
  k.title,
  k.decision_text,
  c.rule_kind,
  sc.payer_mode,sc.payer,
  sc.pg_mode,sc.pg,
  sc.ik_mode,sc.ik,
  sc.legs_mode,sc.legs,
  sc.valid_from,sc.valid_to,
  u.upload_id,u.filename as original_filename,
  c.source_page,c.source_end_page,
  sc.evidence_note,
  sc.verified_at,
  k.updated_at as knowledge_updated_at,
  'SOURCE_REFERENCE_ONLY'::text as usage_class,
  'SEPARATE_CONTRACT_IK_PQ_APPROVAL_AND_POSITION_CHECK_REQUIRED'::text as independent_checks
from public.vn_contract_knowledge k
join public.vn_ocr_rule_candidates c
  on c.knowledge_id=k.knowledge_id and c.status='CONFIRMED'
join public.vn_ocr_rule_scopes sc
  on sc.candidate_id=c.candidate_id and sc.scope_status='VERIFIED'
join public.contract_uploads u
  on u.upload_id=c.upload_id and u.contract_id=k.contract_id
join public.contracts co
  on co.contract_id=k.contract_id and co.record_status='ACTIVE'
   and co.archive_state='NOT_ARCHIVED'
where k.status='APPROVED'
  and k.revalidation_required=false
  and (k.valid_from is null or k.valid_from<=current_date)
  and (k.valid_to is null or k.valid_to>=current_date)
  and sc.valid_from<=current_date
  and (sc.valid_to is null or sc.valid_to>=current_date)
  and c.knowledge_id is not null
  and sc.verified_at is not null
  and u.upload_status not in ('REJECTED','ERROR','BASELINE');

revoke all on table public.vn_ocr_verified_evidence_v1 from public,anon,authenticated;
grant select on table public.vn_ocr_verified_evidence_v1 to service_role;
comment on view public.vn_ocr_verified_evidence_v1 is
  'Read-only OCR source evidence. No implicit wildcard/eligibility. Independent site, contract accession, PQ, version, approval and position checks mandatory.';
