-- Caixa (entradas/saídas) e cupons de doação. Rode no SQL Editor DEPOIS de lotes-lideres.sql (uma vez).

-- ---------- Movimentos do caixa ----------
create table if not exists public.movimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  data date not null default current_date,
  tipo text not null check (tipo in ('entrada', 'saida')),
  caixa text not null check (caixa in ('inscricao', 'doacao')),
  valor numeric(10, 2) not null check (valor > 0),
  descricao text not null,
  forma text check (forma in ('pix', 'dinheiro', 'cartao', 'cupom', 'outro')),
  inscricao_id uuid references public.inscricoes (id) on delete set null,
  cupom_id uuid
);

alter table public.movimentos enable row level security;
create policy "admin gerencia movimentos" on public.movimentos
  for all to authenticated using (true) with check (true);

-- ---------- Cupons ----------
create table if not exists public.cupons (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  codigo text not null unique,
  valor numeric(10, 2) not null check (valor > 0),
  status text not null default 'disponivel' check (status in ('disponivel', 'usado', 'cancelado')),
  observacao text,
  inscricao_id uuid references public.inscricoes (id) on delete set null,
  usado_em timestamptz
);

alter table public.movimentos
  add constraint movimentos_cupom_fkey foreign key (cupom_id) references public.cupons (id) on delete set null;

alter table public.cupons enable row level security;
create policy "admin gerencia cupons" on public.cupons
  for all to authenticated using (true) with check (true);

-- Saldo de doações que ainda pode virar cupom: doações recebidas - saídas do caixa de doações
-- - cupons gerados e ainda não usados (já reservados).
create or replace function public.doacoes_disponiveis() returns numeric
language sql stable as $$
  select
    coalesce((select sum(case when tipo = 'entrada' then valor else -valor end)
              from public.movimentos where caixa = 'doacao'), 0)
    - coalesce((select sum(valor) from public.cupons where status = 'disponivel'), 0)
$$;

-- Gera um cupom sem deixar passar do saldo de doações (trava evita dois cupons ao mesmo tempo).
create or replace function public.gerar_cupom(p_valor numeric, p_observacao text default null)
returns public.cupons
language plpgsql as $$
declare
  c public.cupons;
begin
  perform pg_advisory_xact_lock(hashtext('cupons'));
  if p_valor > public.doacoes_disponiveis() then
    raise exception 'SALDO_DOACOES_INSUFICIENTE';
  end if;
  insert into public.cupons (codigo, valor, observacao)
  values ('CONECT-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)), p_valor, nullif(trim(p_observacao), ''))
  returning * into c;
  return c;
end $$;

-- Usa o cupom numa inscrição: sai do caixa de doações e entra no caixa de inscrições.
create or replace function public.aplicar_cupom(p_cupom uuid, p_inscricao uuid)
returns void
language plpgsql as $$
declare
  c public.cupons;
  nome_inscrito text;
begin
  perform pg_advisory_xact_lock(hashtext('cupons'));
  select * into c from public.cupons where id = p_cupom for update;
  if c is null or c.status <> 'disponivel' then
    raise exception 'CUPOM_INDISPONIVEL';
  end if;
  select nome into nome_inscrito from public.inscricoes where id = p_inscricao;
  if nome_inscrito is null then
    raise exception 'INSCRICAO_NAO_ENCONTRADA';
  end if;

  update public.cupons set status = 'usado', inscricao_id = p_inscricao, usado_em = now() where id = p_cupom;
  insert into public.movimentos (tipo, caixa, valor, descricao, forma, inscricao_id, cupom_id) values
    ('saida', 'doacao', c.valor, 'Cupom ' || c.codigo || ' para ' || nome_inscrito, 'cupom', p_inscricao, p_cupom),
    ('entrada', 'inscricao', c.valor, 'Cupom ' || c.codigo || ' — ' || nome_inscrito, 'cupom', p_inscricao, p_cupom);
end $$;

revoke execute on function public.doacoes_disponiveis(), public.gerar_cupom(numeric, text), public.aplicar_cupom(uuid, uuid) from public, anon;
grant execute on function public.doacoes_disponiveis(), public.gerar_cupom(numeric, text), public.aplicar_cupom(uuid, uuid) to authenticated;
