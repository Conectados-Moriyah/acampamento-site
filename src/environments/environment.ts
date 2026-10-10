// Valores em Supabase > Project Settings > API. A chave "anon" é pública por natureza:
// quem protege os dados são as políticas de RLS em supabase/schema.sql.
const supabaseUrl = 'https://cutjfdfplyiutcbfulqo.supabase.co';

export const environment = {
  supabaseUrl,
  supabaseAnonKey: 'sb_publishable_fbnNhtfkVIDyeNg5_QJKTA_C-Av5dur',
  /** Edge Functions do pagamento (supabase/functions). Os segredos ficam nos Secrets do Supabase. */
  funcoesUrl: `${supabaseUrl}/functions/v1`,
};
