-- Fase 1 do admin. Rode no SQL Editor DEPOIS de schema.sql (uma vez).

-- ---------- Lotes ----------
create table if not exists public.lotes (
  numero int primary key,
  valor numeric(10, 2) not null,
  vagas int not null check (vagas >= 0),
  aberto boolean not null default false
);

insert into public.lotes (numero, valor, vagas, aberto) values
  (1, 350, 37, true),
  (2, 400, 37, false),
  (3, 450, 37, false)
on conflict (numero) do nothing;

alter table public.lotes enable row level security;
create policy "todos veem lotes" on public.lotes for select using (true);
create policy "admin altera lotes" on public.lotes for all to authenticated using (true) with check (true);

-- ---------- Novas colunas das inscrições ----------
alter table public.inscricoes
  add column if not exists tipo text not null default 'participante' check (tipo in ('participante', 'lider')),
  add column if not exists status text not null default 'pendente' check (status in ('pendente', 'confirmada', 'cancelada')),
  add column if not exists genero text,
  add column if not exists lote_numero int references public.lotes (numero),
  add column if not exists valor numeric(10, 2),
  add column if not exists observacao text;

create policy "admin edita inscricoes" on public.inscricoes
  for update to authenticated using (true) with check (true);

-- Admin também pode cadastrar (inscrição de líder).
create policy "admin cria inscricao" on public.inscricoes
  for insert to authenticated with check (true);

-- ---------- Regras automáticas ----------
-- Antes de gravar: visitante sempre entra como participante pendente, no lote aberto mais barato.
create or replace function public.inscricao_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.lotes;
begin
  if coalesce(auth.role(), 'anon') <> 'authenticated' then
    new.tipo := 'participante';
    new.status := 'pendente';
    new.observacao := null;
    new.lote_numero := null;
    new.valor := null;
  end if;

  if new.tipo = 'participante' and new.lote_numero is null then
    select * into l from public.lotes where aberto order by numero limit 1 for update;
    if l is null then
      raise exception 'INSCRICOES_ENCERRADAS';
    end if;
    new.lote_numero := l.numero;
    new.valor := coalesce(new.valor, l.valor);
  end if;

  new.genero := coalesce(new.genero, new.dados -> 'pessoais' ->> 'genero');
  return new;
end $$;

drop trigger if exists inscricao_antes on public.inscricoes;
create trigger inscricao_antes before insert on public.inscricoes
  for each row execute function public.inscricao_antes();

-- Depois de gravar: fecha o lote quando as vagas acabam (inscrições canceladas não contam).
create or replace function public.inscricao_fecha_lote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lote_numero is not null then
    update public.lotes l set aberto = false
    where l.numero = new.lote_numero
      and (select count(*) from public.inscricoes i
           where i.lote_numero = l.numero and i.tipo = 'participante' and i.status <> 'cancelada') >= l.vagas;
  end if;
  return new;
end $$;

drop trigger if exists inscricao_fecha_lote on public.inscricoes;
create trigger inscricao_fecha_lote after insert or update of lote_numero, status on public.inscricoes
  for each row execute function public.inscricao_fecha_lote();
