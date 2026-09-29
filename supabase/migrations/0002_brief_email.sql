-- Phase 2: interview briefs, email drafts (templates without PII) and Arjun's decisions.
create table if not exists interview_briefs (
  resume_id text primary key references resumes(resume_id) on delete cascade,
  brief jsonb not null,            -- generated from redacted inputs only; no PII
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  resume_id text not null references resumes(resume_id) on delete cascade,
  kind text not null check (kind in ('invite','rejection')),
  subject text not null,
  body text not null,              -- template with [CANDIDATE_FIRST_NAME]; name/address merged only at send time
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  model text,
  provider_id text,                -- Resend email id
  delivery_mode text check (delivery_mode in ('redirect','live')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists emails_one_per_resume on emails (resume_id);

create table if not exists decisions (
  resume_id text primary key references resumes(resume_id) on delete cascade,
  action text not null check (action in ('invite','reject')),
  created_at timestamptz not null default now()
);

alter table interview_briefs enable row level security;
alter table emails enable row level security;
alter table decisions enable row level security;
