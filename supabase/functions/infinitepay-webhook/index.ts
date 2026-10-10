// Webhook da InfinitePay (endereço enviado como webhook_url ao criar o checkout).
// 200 = processado (ou já processado); 400 = a InfinitePay tenta de novo.
import { confirmarPagamento, servir } from '../_shared/pagamento.ts';

servir(confirmarPagamento, 400);
