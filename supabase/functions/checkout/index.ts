// POST { inscricaoId } -> { url } (link do checkout InfinitePay) | { quitada: true } | 409/400/502
import { criarCheckout, servir } from '../_shared/pagamento.ts';

servir((corpo) => criarCheckout(corpo['inscricaoId']));
