-- Kargo Hiring Dashboard: initial schema.
-- RLS is enabled on every table with NO policies, so only the service role (server-side) can read or write.
-- PII lives only in candidate_pii; every other table, log and AI request uses resume_id.

create extension if not exists pgcrypto;

create table if not exists candidate_pii (
  resume_id text primary key,
  full_name text not null,
  email text,
  phone text,
  links jsonb not null default '[]',
  location_raw text,
  redaction_values jsonb,          -- original values from redaction_report
  created_at timestamptz not null default now()
);

create table if not exists resumes (
  resume_id text primary key references candidate_pii(resume_id) on delete cascade,
  applied_role text not null check (applied_role in ('PM','SPM')),
  file_name text not null,
  file_type text not null check (file_type in ('pdf','docx')),
  storage_path text,               -- private bucket 'cv-originals'
  cv_hash text not null,
  redacted_text text not null,
  redaction_counts jsonb not null,
  location_status text not null check (location_status in ('mumbai','willing_to_relocate','explicitly_unwilling','not_stated')),
  status text not null default 'redacted'
    check (status in ('redacted','redaction_failed','extracting','extraction_failed','scored')),
  created_at timestamptz not null default now(),
  unique (cv_hash, applied_role)
);

create table if not exists extractions (
  id uuid primary key default gen_random_uuid(),
  resume_id text references resumes(resume_id) on delete cascade,
  model text not null,
  prompt_version text not null,
  config_version text not null,
  extraction jsonb not null,
  raw_response text,
  attempts int not null default 1,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists extractions_resume_idx on extractions (resume_id, created_at desc);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  resume_id text references resumes(resume_id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  is_applied_role boolean not null,
  score numeric(5,1) not null,
  band text not null,              -- pre-capacity band from evaluate()
  decision text not null,          -- Accept - Priority | Accept | Review | Reject
  levels jsonb not null,
  points jsonb not null,
  evidence_multipliers jsonb not null,
  base numeric(6,2) not null,
  penalties jsonb not null,
  bonuses jsonb not null,
  penalty_total numeric(5,1) not null default 0,
  bonus_total numeric(5,1) not null default 0,
  product_years numeric(4,1),
  gate_failed text,
  non_negotiables_failed jsonb not null,
  dna_triad int not null,
  dna_evidence_multiplier numeric(4,3) not null default 0,
  flags jsonb not null,
  explanation jsonb,
  interview_probes jsonb,
  config_version text not null,
  created_at timestamptz not null default now(),
  unique (resume_id, role)
);

create table if not exists audit_log (
  id bigserial primary key,
  resume_id text,
  event text not null,             -- uploaded, redacted, redaction_failed, confirmed, extraction_ok, extraction_failed, scored, exported, duplicate
  payload jsonb,                   -- never contains PII
  created_at timestamptz not null default now()
);
create index if not exists audit_resume_idx on audit_log (resume_id, created_at);

alter table candidate_pii enable row level security;
alter table resumes enable row level security;
alter table extractions enable row level security;
alter table scores enable row level security;
alter table audit_log enable row level security;

-- Private bucket for original files (they contain PII). Never create public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-originals', 'cv-originals', false, 4194304,
        array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;
