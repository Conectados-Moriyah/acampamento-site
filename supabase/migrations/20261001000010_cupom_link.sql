-- Cupom vira link de inscrição. Rode no SQL Editor DEPOIS de infinitepay.sql (uma vez).
--
-- Gerar um cupom (para participante ou líder) cria junto um link de uso único. Quem se inscreve
-- pelo link recebe o desconto na hora: o valor do cupom (até o preço do lote) sai do caixa de
-- doações e entra no de inscrições. O checkout cobra só o que falta; se o cupom cobre tudo, a
-- inscrição já fica confirmada e não há pagamento.

alter table public.cupons
  add column if not exists tipo text not null default 'participante' check (tipo in ('participante', 'lider')),
  add column if not exists convite uuid references public.convites (token) on delete set null;

-- Agora gera o cupom e o link juntos.
drop function if exists public.gerar_cupom(numeric, text);
create function public.gerar_cupom(p_valor numeric, p_tipo text, p_observacao text default null)
returns public.cupons
language plpgsql as $$
declare
  c public.cupons;
  v_convite uuid;
begin
  perform pg_advisory_xact_lock(hashtext('cupons'));
  if p_valor > public.doacoes_disponiveis() then
    raise exception 'SALDO_DOACOES_INSUFICIENTE';
  end if;
  insert into public.convites (tipo, modo, observacao)
  values (p_tipo, 'checkout', nullif(trim(p_observacao), ''))
  returning token into v_convite;
  insert into public.cupons (codigo, valor, tipo, observacao, convite)
  values ('CONECT-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)), p_valor, p_tipo,
          nullif(trim(p_observacao), ''), v_convite)
  returning * into c;
  return c;
end $$;
revoke execute on function public.gerar_cupom(numeric, text, text) from public, anon;
grant execute on function public.gerar_cupom(numeric, text, text) to authenticated;

-- A ficha mostra o desconto do link.
create or replace function public.ler_convite(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'tipo', v.tipo,
    'modo', v.modo,
    'desconto', (select c.valor from public.cupons c where c.convite = v.token and c.status = 'disponivel')
  )
  from public.convites v where v.token = p_token and not v.cancelado and v.usado_em is null
$$;

-- Depois de gravar a inscrição: marca o link como usado e, se ele for de um cupom, aplica o desconto.
create or replace function public.inscricao_usa_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.cupons;
  v_desconto numeric;
begin
  if new.convite is null then
    return new;
  end if;
  update public.convites set usado_em = now(), inscricao_id = new.id where token = new.convite;

  perform pg_advisory_xact_lock(hashtext('cupons'));
  select * into c from public.cupons where convite = new.convite and status = 'disponivel' for update;
  if found and new.valor > 0 then
    -- Cupom maior que o preço: só o preço é usado; a sobra volta ao saldo livre de doações.
    v_desconto := least(c.valor, new.valor);
    update public.cupons set status = 'usado', inscricao_id = new.id, usado_em = now() where id = c.id;
    insert into public.movimentos (tipo, caixa, valor, descricao, forma, inscricao_id, cupom_id) values
      ('saida', 'doacao', v_desconto, 'Cupom ' || c.codigo || ' para ' || new.nome, 'cupom', new.id, c.id),
      ('entrada', 'inscricao', v_desconto, 'Cupom ' || c.codigo || ' — ' || new.nome, 'cupom', new.id, c.id);
    if v_desconto >= new.valor then
      update public.inscricoes set status = 'confirmada' where id = new.id;
    end if;
  end if;
  return new;
end $$;

-- Usar o cupom à mão numa inscrição já feita cancela o link dele (não vale duas vezes).
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
  update public.convites set cancelado = true where token = c.convite and usado_em is null;
  insert into public.movimentos (tipo, caixa, valor, descricao, forma, inscricao_id, cupom_id) values
    ('saida', 'doacao', c.valor, 'Cupom ' || c.codigo || ' para ' || nome_inscrito, 'cupom', p_inscricao, p_cupom),
    ('entrada', 'inscricao', c.valor, 'Cupom ' || c.codigo || ' — ' || nome_inscrito, 'cupom', p_inscricao, p_cupom);
end $$;

-- Cancelar o cupom também cancela o link que ainda não foi usado.
create or replace function public.cupom_cancela_convite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' and new.convite is not null then
    update public.convites set cancelado = true where token = new.convite and usado_em is null;
  end if;
  return new;
end $$;

drop trigger if exists cupom_cancela_convite on public.cupons;
create trigger cupom_cancela_convite after update of status on public.cupons
  for each row execute function public.cupom_cancela_convite();
