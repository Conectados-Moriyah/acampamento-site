-- Links de inscrição gerados pelo admin (para carnê). Rode no SQL Editor DEPOIS de carne.sql (uma vez).
--
-- O admin gera um link de uso único com o tipo (participante ou líder). Quem preenche por ele
-- entra como carnê, sem pagamento no site; o admin gera as parcelas depois na aba Carnês.
-- Quem preenche pelo site (sem link) é sempre participante à vista.

create table if not exists public.convites (
  token uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('participante', 'lider')),
  observacao text,
  cancelado boolean not null default false,
  usado_em timestamptz,
  inscricao_id uuid references public.inscricoes (id) on delete set null
);

alter table public.convites enable row level security;
create policy "admin gerencia convites" on public.convites
  for all to authenticated using (true) with check (true);

alter table public.inscricoes add column if not exists convite uuid references public.convites (token);

-- A ficha consulta o link sem poder listar os convites: só responde o tipo de um token válido.
create or replace function public.ler_convite(p_token uuid) returns text
language sql stable security definer set search_path = public as $$
  select tipo from public.convites where token = p_token and not cancelado and usado_em is null
$$;
revoke execute on function public.ler_convite(uuid) from public;
grant execute on function public.ler_convite(uuid) to anon, authenticated;

-- Regras da inscrição pública, agora considerando o convite.
create or replace function public.inscricao_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.lotes;
  c public.convites;
begin
  if coalesce(auth.role(), 'anon') <> 'authenticated' then
    new.status := 'pendente';
    new.observacao := null;
    new.lote_numero := null;
    new.valor := null;
    new.parcelas_solicitadas := null;
    new.tipo := 'participante';
    new.forma_pagamento := 'avista';

    if new.convite is not null then
      select * into c from public.convites where token = new.convite for update;
      if c is null or c.cancelado or c.usado_em is not null then
        raise exception 'CONVITE_INVALIDO';
      end if;
      new.tipo := c.tipo;
      new.forma_pagamento := 'carne';
    end if;
  end if;

  if new.lote_numero is null then
    select * into l from public.lotes where aberto and tipo = new.tipo order by numero limit 1 for update;
    if l is null then
      raise exception 'INSCRICOES_ENCERRADAS';
    end if;
    new.lote_numero := l.numero;
    new.valor := coalesce(new.valor, l.valor);
  end if;

  new.genero := coalesce(new.genero, new.dados -> 'pessoais' ->> 'genero');
  return new;
end $$;

-- Depois de gravar: marca o convite como usado.
create or replace function public.inscricao_usa_convite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.convite is not null then
    update public.convites set usado_em = now(), inscricao_id = new.id where token = new.convite;
  end if;
  return new;
end $$;

drop trigger if exists inscricao_usa_convite on public.inscricoes;
create trigger inscricao_usa_convite after insert on public.inscricoes
  for each row execute function public.inscricao_usa_convite();

-- As parcelas não são mais geradas na hora: o admin vincula ao carnê depois.
drop trigger if exists inscricao_gera_carne on public.inscricoes;
drop function if exists public.inscricao_gera_carne();
