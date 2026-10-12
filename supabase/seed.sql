-- Dados de teste do banco LOCAL (npx supabase db reset). Nunca rode em produção.
-- Os lotes já vêm das migrations.

-- Admin de teste: admin@teste.local / admin123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'admin@teste.local', crypt('admin123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
  'email', '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@teste.local"}', now(), now(), now()
);

-- Links de convite com token fixo, para abrir direto no navegador:
--   carnê (participante): http://localhost:4200/inscricao?convite=22222222-2222-2222-2222-222222222222
--   checkout (líder):     http://localhost:4200/inscricao?convite=33333333-3333-3333-3333-333333333333
insert into public.convites (token, tipo, modo, observacao) values
  ('22222222-2222-2222-2222-222222222222', 'participante', 'carne', 'Teste local: carnê'),
  ('33333333-3333-3333-3333-333333333333', 'lider', 'checkout', 'Teste local: líder paga online');
