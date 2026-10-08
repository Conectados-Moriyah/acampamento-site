import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Destino do redirecionamento da InfinitePay. A confirmação de verdade chega pelo webhook. */
@Component({
  imports: [RouterLink],
  selector: 'app-pago',
  styleUrl: '../inscricao.scss',
  template: `
    <section class="cartao fim">
      <h2>Pagamento recebido! 🙌</h2>
      <p>
        Obrigado! Assim que a InfinitePay confirmar, sua inscrição fica como confirmada. A
        liderança entra em contato pelo WhatsApp informado na ficha se precisar de algo.
      </p>
      <a class="btn btn--escuro" routerLink="/">Voltar ao site</a>
    </section>
  `,
})
export class Pago {}
