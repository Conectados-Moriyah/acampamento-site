import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // A área admin depende da sessão do navegador: não faz sentido pré-renderizar.
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  // O id da inscrição só existe em tempo de execução.
  { path: 'inscricao/pagar/:id', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
