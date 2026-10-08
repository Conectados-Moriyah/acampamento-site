import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Pagamento {
  /**
   * Abre o checkout da InfinitePay para a inscrição. Retorna `false` se não foi possível (a ficha
   * já está gravada; a liderança combina o pagamento pelo WhatsApp).
   */
  async irParaCheckout(inscricaoId: string): Promise<boolean> {
    try {
      const resposta = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscricaoId }),
      });
      const { url } = (await resposta.json()) as { url?: string };
      if (!resposta.ok || !url) return false;
      window.location.assign(url);
      return true;
    } catch {
      return false;
    }
  }
}
