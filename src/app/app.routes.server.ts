import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // A área admin depende da sessão do navegador: não faz sentido pré-renderizar.
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
