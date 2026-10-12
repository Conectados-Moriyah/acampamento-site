-- Links com modo: 'carne' (sem pagamento no site) ou 'checkout' (paga online pelo InfinitePay,
-- usado na inscrição de líder). Rode no SQL Editor DEPOIS de convites.sql (uma vez).

alter table public.convites
  add column if not exists modo text not null default 'carne' check (modo in ('carne', 'checkout'));

-- A ficha precisa saber o tipo e o modo do link para mostrar o texto certo.
drop function if exists public.ler_convite(uuid);
create function public.ler_convite(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('tipo', tipo, 'modo', modo)
  from public.convites where token = p_token and not cancelado and usado_em is null
$$;
revoke execute on function public.ler_convite(uuid) from public;
grant execute on function public.ler_convite(uuid) to anon, authenticated;

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
      new.forma_pagamento := case c.modo when 'carne' then 'carne' else 'avista' end;
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
