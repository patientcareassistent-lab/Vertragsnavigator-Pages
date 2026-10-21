-- VN 2.1: OCR-Regelkandidaten (keine Live-Vertragsregeln).
-- Neue Tabellen erhalten explizite Grants; bewusst keine anon/authenticated Rechte.
create table if not exists public.vn_ocr_rule_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.contract_uploads(upload_id),
  contract_id text not null references public.contracts(contract_id),
  candidate_key text not null,
  clause_key text not null,
  source_page integer not null check (source_page between 1 and 250),
  source_end_page integer not null check (source_end_page between 1 and 250 and source_end_page >= source_page),
  rule_kind text not null check (rule_kind in ('GENEHMIGUNG','FRIST','LEGS','ABRECHNUNG','VERSORGUNG','VERORDNUNG','DOKUMENTATION')),
  display_title text not null,
  source_excerpt text not null,
  proposed_fields jsonb not null default '{}'::jsonb,
  ocr_quality text not null check (ocr_quality in ('OCR','PDF_TEXT','UNCERTAIN')),
  content_hash text not null,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','REJECTED','SUPERSEDED')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  knowledge_id uuid unique references public.vn_contract_knowledge(knowledge_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vn_ocr_candidate_upload_key_uniq unique(upload_id,candidate_key),
  constraint vn_ocr_review_status_check check (
    (status in ('CONFIRMED','REJECTED') and reviewed_by is not null and reviewed_at is not null and length(trim(coalesce(review_note,''))) >= 12)
    or status in ('PENDING','SUPERSEDED')
  ),
  constraint vn_ocr_candidate_sha_check check (content_hash ~ '^[a-f0-9]{64}$')
);
create index if not exists vn_ocr_rule_candidates_upload_status_idx
  on public.vn_ocr_rule_candidates(upload_id,status,rule_kind,source_page);
create index if not exists vn_ocr_rule_candidates_contract_idx
  on public.vn_ocr_rule_candidates(contract_id,created_at desc);
alter table public.vn_ocr_rule_candidates enable row level security;
-- Kein direktes Client-API: ausschließlich authentifizierte Edge-Function mit
-- expliziter Berechtigungsprüfung und serverseitigem service_role Zugriff.
revoke all on table public.vn_ocr_rule_candidates from public, anon, authenticated;
grant select, insert, update on table public.vn_ocr_rule_candidates to service_role;
comment on table public.vn_ocr_rule_candidates is
  'VN 2.1 OCR-Regelhinweise für manuelle Prüfung, keine veröffentlichbaren Live-Regeln. Die Freigabe der Wissensbasis ist separat.';
