import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Supabase } from '../../../core/supabase';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-admin-login',
  styleUrl: '../admin.scss',
  templateUrl: './login.html',
})
export class AdminLogin {
  private readonly supabase = inject(Supabase);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', Validators.required],
  });
  protected readonly erro = signal<string | null>(null);
  protected readonly carregando = signal(false);

  protected async entrar(): Promise<void> {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.carregando.set(true);
    const { email, senha } = this.form.getRawValue();
    const erro = await this.supabase.entrar(email, senha);
    this.carregando.set(false);
    if (erro) this.erro.set(erro);
    else this.router.navigateByUrl('/admin');
  }
}
