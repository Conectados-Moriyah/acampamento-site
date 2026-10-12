// Supabase LOCAL (npx supabase start), usado por `npm run start:local`. A chave é a publishable
// padrão da CLI; se `npx supabase status` mostrar outra, troque aqui.
const supabaseUrl = 'http://127.0.0.1:54321';

export const environment = {
  supabaseUrl,
  supabaseAnonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  /** Edge Functions locais (npx supabase functions serve). */
  funcoesUrl: `${supabaseUrl}/functions/v1`,
};
