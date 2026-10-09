import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  { path: '', component: Inicio, title: 'Conectados — Acampamento Jovem Emanuel Moriyah' },
  {
    path: 'inscricao',
    loadComponent: () => import('./pages/inscricao/inscricao').then((m) => m.Inscricao),
    title: 'Ficha de inscrição — Conectados',
  },
  {
    path: 'inscricao/pago',
    loadComponent: () => import('./pages/inscricao/pago/pago').then((m) => m.Pago),
    title: 'Pagamento recebido — Conectados',
  },
  {
    path: 'inscricao/pagar/:id',
    loadComponent: () => import('./pages/inscricao/pagar/pagar').then((m) => m.Pagar),
    title: 'Pagamento da inscrição — Conectados',
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/admin/login/login').then((m) => m.AdminLogin),
    title: 'Login — Admin Conectados',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/inscricoes/inscricoes').then((m) => m.AdminInscricoes),
    title: 'Inscrições — Admin Conectados',
  },
  { path: '**', redirectTo: '' },
];
