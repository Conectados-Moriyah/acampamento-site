-- Pagamento online (InfinitePay). Rode no SQL Editor DEPOIS de carne.sql (uma vez).

-- Identifica o pagamento online no caixa; o índice único impede lançar o mesmo pagamento duas vezes
-- quando a InfinitePay reenvia o webhook.
alter table public.movimentos add column if not exists pagamento_nsu text unique;

-- Chamada só pelo servidor do site (chave service_role), depois de confirmar o pagamento na InfinitePay.
-- Lança a entrada no caixa de inscrições e confirma a inscrição. Retorna false se já estava lançado.
create or replace function public.registrar_pagamento_online(
  p_inscricao uuid, p_valor numeric, p_forma text, p_nsu text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  nome_inscrito text;
begin
  select nome into nome_inscrito from public.inscricoes where id = p_inscricao;
  if nome_inscrito is null then
    raise exception 'INSCRICAO_NAO_ENCONTRADA';
  end if;

  insert into public.movimentos (tipo, caixa, valor, descricao, forma, inscricao_id, pagamento_nsu)
  values ('entrada', 'inscricao', p_valor, 'Inscrição online — ' || nome_inscrito, p_forma, p_inscricao, p_nsu)
  on conflict (pagamento_nsu) do nothing;
  if not found then
    return false;
  end if;

  update public.inscricoes set status = 'confirmada' where id = p_inscricao and status = 'pendente';
  return true;
end $$;

revoke execute on function public.registrar_pagamento_online(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_online(uuid, numeric, text, text) to service_role;

-- O servidor lê a inscrição (valor vem do banco, nunca do navegador) com a chave service_role,
-- que ignora o RLS: nenhuma política nova é necessária.
