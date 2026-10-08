-- Pagamento via carnê (parcelas controladas). Rode no SQL Editor DEPOIS de caixa-cupons.sql (uma vez).

alter table public.inscricoes
  add column if not exists forma_pagamento text not null default 'avista' check (forma_pagamento in ('avista', 'carne')),
  add column if not exists parcelas_solicitadas int check (parcelas_solicitadas between 1 and 12);

-- Uma parcela está paga quando tem um lançamento de entrada no caixa. Excluir o lançamento
-- (estorno) a deixa em aberto de novo, então caixa e carnê nunca ficam diferentes.
create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes (id) on delete cascade,
  numero int not null,
  total int not null,
  valor numeric(10, 2) not null check (valor > 0),
  vencimento date not null,
  movimento_id uuid references public.movimentos (id) on delete set null,
  unique (inscricao_id, numero)
);

alter table public.parcelas enable row level security;
create policy "admin gerencia parcelas" on public.parcelas
  for all to authenticated using (true) with check (true);

-- Divide o valor da inscrição em p_total parcelas mensais. Centavos que sobram vão na 1ª parcela.
-- Recria as parcelas em aberto; falha se alguma já foi paga.
create or replace function public.gerar_carne(p_inscricao uuid, p_total int, p_primeiro_vencimento date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_valor numeric;
  v_base numeric;
  i int;
begin
  if p_total < 1 or p_total > 12 then
    raise exception 'PARCELAS_INVALIDAS';
  end if;
  if exists (select 1 from public.parcelas where inscricao_id = p_inscricao and movimento_id is not null) then
    raise exception 'CARNE_COM_PARCELA_PAGA';
  end if;
  select valor into v_valor from public.inscricoes where id = p_inscricao;
  if v_valor is null or v_valor <= 0 then
    raise exception 'INSCRICAO_SEM_VALOR';
  end if;

  delete from public.parcelas where inscricao_id = p_inscricao;
  v_base := trunc(v_valor / p_total, 2);
  for i in 1..p_total loop
    insert into public.parcelas (inscricao_id, numero, total, valor, vencimento)
    values (
      p_inscricao, i, p_total,
      case when i = 1 then v_valor - v_base * (p_total - 1) else v_base end,
      (p_primeiro_vencimento + make_interval(months => i - 1))::date
    );
  end loop;
  update public.inscricoes set forma_pagamento = 'carne', parcelas_solicitadas = p_total where id = p_inscricao;
end $$;

-- Ficha pública com carnê: gera as parcelas sozinho, 1º vencimento dia 10 do mês seguinte.
create or replace function public.inscricao_gera_carne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.forma_pagamento = 'carne' and new.valor is not null then
    perform public.gerar_carne(
      new.id,
      coalesce(new.parcelas_solicitadas, 1),
      (date_trunc('month', current_date) + interval '1 month 9 days')::date
    );
  end if;
  return new;
end $$;

drop trigger if exists inscricao_gera_carne on public.inscricoes;
create trigger inscricao_gera_carne after insert on public.inscricoes
  for each row execute function public.inscricao_gera_carne();

-- Dá baixa numa parcela: lança a entrada no caixa de inscrições e liga à parcela.
create or replace function public.pagar_parcela(p_parcela uuid, p_forma text, p_data date default current_date)
returns void
language plpgsql as $$
declare
  p public.parcelas;
  nome_inscrito text;
  mov uuid;
begin
  select * into p from public.parcelas where id = p_parcela for update;
  if p is null then
    raise exception 'PARCELA_NAO_ENCONTRADA';
  end if;
  if p.movimento_id is not null then
    raise exception 'PARCELA_JA_PAGA';
  end if;
  select nome into nome_inscrito from public.inscricoes where id = p.inscricao_id;

  insert into public.movimentos (tipo, caixa, valor, descricao, forma, inscricao_id, data)
  values ('entrada', 'inscricao', p.valor, 'Carnê ' || p.numero || '/' || p.total || ' — ' || nome_inscrito,
          p_forma, p.inscricao_id, p_data)
  returning id into mov;
  update public.parcelas set movimento_id = mov where id = p_parcela;
end $$;

revoke execute on function public.gerar_carne(uuid, int, date), public.pagar_parcela(uuid, text, date) from public, anon;
grant execute on function public.gerar_carne(uuid, int, date), public.pagar_parcela(uuid, text, date) to authenticated;
