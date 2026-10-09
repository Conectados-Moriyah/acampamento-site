import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Pagamento {
  /** Verdadeiro quando o checkout não abriu na última tentativa (a ficha já está gravada). */
  readonly falhou = signal(false);
  /** Verdadeiro quando a inscrição não está aguardando pagamento (já paga, cancelada ou em carnê). */
  readonly indisponivel = signal(false);
  /** Verdadeiro quando o cupom do link cobriu a inscrição inteira: não há o que pagar. */
  readonly quitada = signal(false);

  /**
   * Abre o checkout da InfinitePay para a inscrição. Retorna `false` se não foi possível (a ficha
   * já está gravada; a liderança combina o pagamento pelo WhatsApp).
   */
  async irParaCheckout(inscricaoId: string): Promise<boolean> {
    this.falhou.set(false);
    this.indisponivel.set(false);
    this.quitada.set(false);
    try {
      const resposta = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscricaoId }),
      });
      const { url, quitada } = (await resposta.json()) as { url?: string; quitada?: boolean };
      if (resposta.ok && quitada) {
        this.quitada.set(true);
        return false;
      }
      if (!resposta.ok || !url) {
        if (resposta.status === 409) this.indisponivel.set(true);
        else this.falhou.set(true);
        return false;
      }
      window.location.assign(url);
      return true;
    } catch {
      this.falhou.set(true);
      return false;
    }
  }
}
