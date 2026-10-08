-- Rode no SQL Editor do projeto Supabase (uma vez).

create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  criada_em timestamptz not null default now(),
  nome text not null,
  telefone text not null,
  email text not null,
  dados jsonb not null
);

alter table public.inscricoes enable row level security;

-- Qualquer visitante pode enviar uma ficha, mas não pode ler nenhuma.
create policy "visitante envia inscricao" on public.inscricoes
  for insert to anon with check (true);

-- Só usuários logados (admins criados em Authentication > Users) leem as fichas.
create policy "admin le inscricoes" on public.inscricoes
  for select to authenticated using (true);
