-- WhatsApp de quem paga o carnê. Vazio = o telefone da própria inscrição.
-- Rode no SQL Editor DEPOIS de comprovantes.sql (uma vez).
alter table public.inscricoes add column if not exists pagador_telefone text;
