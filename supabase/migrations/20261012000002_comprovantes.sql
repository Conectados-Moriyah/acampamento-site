-- Comprovante de pagamento das parcelas do carnê (foto/PDF que a pessoa manda no WhatsApp).
-- Rode no SQL Editor DEPOIS de pagador_carne.sql (uma vez).

alter table public.parcelas add column if not exists comprovante text; -- caminho no bucket

-- Bucket privado: só o admin (logado) envia e abre; os links são assinados e expiram.
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

create policy "admin le comprovantes" on storage.objects
  for select to authenticated using (bucket_id = 'comprovantes');
create policy "admin envia comprovantes" on storage.objects
  for insert to authenticated with check (bucket_id = 'comprovantes');
create policy "admin apaga comprovantes" on storage.objects
  for delete to authenticated using (bucket_id = 'comprovantes');
