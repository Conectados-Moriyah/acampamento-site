import { Component, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

type Situacao = 'conferindo' | 'confirmado' | 'pendente';

/**
 * Destino do redirecionamento da InfinitePay. A URL traz os dados do pagamento; eles são enviados
 * ao servidor, que confere na InfinitePay e marca a inscrição como confirmada (participante e líder).
 * O webhook faz o mesmo em paralelo; a gravação é idempotente.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-pago',
  styleUrl: '../inscricao.scss',
  template: `
    <section class="cartao fim">
      @switch (situacao()) {
        @case ('confirmado') {
          <h2>Pagamento confirmado! 🙌</h2>
          <p>Obrigado! Sua inscrição está confirmada.</p>
        }
        @case ('pendente') {
          <h2>Pagamento recebido! 🙌</h2>
          <p>
            Obrigado! Assim que a InfinitePay confirmar, sua inscrição fica como confirmada. A
            liderança entra em contato pelo WhatsApp informado na ficha se precisar de algo.
          </p>
        }
        @default {
          <h2>Conferindo o pagamento…</h2>
          <p>Aguarde um instante.</p>
        }
      }
      <a class="btn btn--escuro" routerLink="/">Voltar ao site</a>
    </section>
  `,
})
export class Pago {
  private readonly consulta = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly situacao = signal<Situacao>('conferindo');

  constructor() {
    afterNextRender(() => void this.confirmar());
  }

  private async confirmar(): Promise<void> {
    const corpo = {
      order_nsu: this.consulta.get('order_nsu'),
      transaction_nsu: this.consulta.get('transaction_nsu'),
      slug: this.consulta.get('slug'),
      capture_method: this.consulta.get('capture_method'),
    };
    if (!corpo.order_nsu || !corpo.transaction_nsu || !corpo.slug) {
      this.situacao.set('pendente');
      return;
    }
    try {
      const resposta = await fetch(`${environment.funcoesUrl}/pagamento-confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const resultado = (await resposta.json()) as { ok?: boolean };
      this.situacao.set(resposta.ok && resultado.ok ? 'confirmado' : 'pendente');
    } catch {
      this.situacao.set('pendente');
    }
  }
}
