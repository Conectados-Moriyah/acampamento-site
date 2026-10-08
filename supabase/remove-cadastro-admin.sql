-- Remove o cadastro manual de inscrições pelo admin. Rode no SQL Editor DEPOIS de convites-modo.sql (uma vez).
--
-- Toda inscrição agora entra pela ficha (site ou link). Quem está logado no admin e abre a ficha
-- no mesmo navegador também consegue enviar, mas segue exatamente as mesmas regras do visitante.

drop policy if exists "admin cria inscricao" on public.inscricoes;

drop policy if exists "visitante envia inscricao" on public.inscricoes;
create policy "ficha envia inscricao" on public.inscricoes
  for insert to anon, authenticated with check (true);

-- Regras da ficha valem para qualquer inserção (antes, o admin logado escapava delas).
create or replace function public.inscricao_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.lotes;
  c public.convites;
begin
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

  select * into l from public.lotes where aberto and tipo = new.tipo order by numero limit 1 for update;
  if l is null then
    raise exception 'INSCRICOES_ENCERRADAS';
  end if;
  new.lote_numero := l.numero;
  new.valor := l.valor;

  new.genero := coalesce(new.genero, new.dados -> 'pessoais' ->> 'genero');
  return new;
end $$;
