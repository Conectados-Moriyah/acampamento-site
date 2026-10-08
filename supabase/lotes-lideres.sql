-- Lotes separados para líderes. Rode no SQL Editor DEPOIS de fase1.sql (uma vez).

-- Lote passa a ser identificado por (tipo, numero).
alter table public.inscricoes drop constraint if exists inscricoes_lote_numero_fkey;

alter table public.lotes
  add column if not exists tipo text not null default 'participante' check (tipo in ('participante', 'lider'));
alter table public.lotes drop constraint lotes_pkey;
alter table public.lotes add primary key (tipo, numero);

insert into public.lotes (tipo, numero, valor, vagas, aberto) values
  ('lider', 1, 250, 20, true),
  ('lider', 2, 280, 10, false),
  ('lider', 3, 310, 10, false)
on conflict (tipo, numero) do nothing;

alter table public.inscricoes
  add constraint inscricoes_lote_fkey foreign key (tipo, lote_numero) references public.lotes (tipo, numero);

-- Toda inscrição (participante ou líder) entra no lote aberto de menor número do seu tipo.
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

create or replace function public.inscricao_fecha_lote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lote_numero is not null then
    update public.lotes l set aberto = false
    where l.tipo = new.tipo and l.numero = new.lote_numero
      and (select count(*) from public.inscricoes i
           where i.tipo = l.tipo and i.lote_numero = l.numero and i.status <> 'cancelada') >= l.vagas;
  end if;
  return new;
end $$;

drop trigger if exists inscricao_fecha_lote on public.inscricoes;
create trigger inscricao_fecha_lote after insert or update of tipo, lote_numero, status on public.inscricoes
  for each row execute function public.inscricao_fecha_lote();
