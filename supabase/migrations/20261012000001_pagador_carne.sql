-- Quem paga o carnê (ex.: pai, mãe, responsável). Vazio = o próprio inscrito.
-- Rode no SQL Editor DEPOIS de cupom-link-fix.sql (uma vez).
alter table public.inscricoes add column if not exists pagador text;
