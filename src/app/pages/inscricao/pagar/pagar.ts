import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Pagamento } from '../../../core/pagamento';

/** Link de pagamento enviado pela liderança: gera um checkout novo e leva a pessoa até ele. */
@Component({
  imports: [RouterLink],
  selector: 'app-pagar',
  styleUrl: '../inscricao.scss',
  template: `
    <section class="cartao fim">
      @if (pagamento.indisponivel()) {
        <h2>Nada a pagar por aqui</h2>
        <p>Esta inscrição não está aguardando pagamento. Se tiver dúvidas, fale com a liderança.</p>
        <a class="btn btn--escuro" routerLink="/">Voltar ao site</a>
      } @else if (pagamento.falhou()) {
        <h2>Não foi possível abrir o pagamento</h2>
        <p>
          Tente novamente em instantes. Se o problema continuar, fale com a liderança pelo WhatsApp.
        </p>
        <button class="btn btn--escuro" type="button" (click)="abrir()">Tentar de novo</button>
      } @else {
        <h2>Abrindo o pagamento…</h2>
        <p>Você será levado ao checkout da InfinitePay.</p>
      }
    </section>
  `,
})
export class Pagar implements OnInit {
  protected readonly pagamento = inject(Pagamento);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  ngOnInit(): void {
    this.abrir();
  }

  protected abrir(): void {
    void this.pagamento.irParaCheckout(this.id);
  }
}
