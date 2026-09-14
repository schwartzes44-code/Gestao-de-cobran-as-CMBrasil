-- Alpha 4: armazena cônjuge do cliente, avalista(s) e cônjuge(s) do avalista
alter table public.clientes
  add column if not exists responsaveis jsonb not null default '{}'::jsonb;

comment on column public.clientes.responsaveis is
  'Dados extraídos do PDF: clientSpouse e guarantors (incluindo spouse quando houver).';
