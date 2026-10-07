import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';

export const routes: Routes = [
  { path: '', component: Inicio, title: 'Conectados — Acampamento Jovem Emanuel Moriyah' },
  {
    path: 'inscricao',
    loadComponent: () => import('./pages/inscricao/inscricao').then((m) => m.Inscricao),
    title: 'Ficha de inscrição — Conectados',
  },
  { path: '**', redirectTo: '' },
];
