-- Correção do cupom-link.sql: o desconto não era aplicado. Rode no SQL Editor (uma vez).
--
-- O teste "achou o cupom" usava `c is not null`, que para uma linha inteira só é verdadeiro quando
-- TODAS as colunas estão preenchidas. Cupom novo tem colunas vazias (inscricao_id, usado_em), então
-- o teste dava sempre falso. O certo é `found`.

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
