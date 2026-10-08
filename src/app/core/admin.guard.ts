import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Supabase } from './supabase';

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (await inject(Supabase).usuarioAtual()) ? true : router.parseUrl('/admin/login');
};
