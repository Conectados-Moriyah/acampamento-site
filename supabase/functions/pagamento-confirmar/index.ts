// Confirmação pelo retorno do navegador (/inscricao/pago?order_nsu=...). Cobre o caso em que o
// webhook atrasa. É seguro: a confirmação é feita na InfinitePay e a gravação é idempotente
// (o mesmo transaction_nsu nunca lança duas vezes).
import { confirmarPagamento, servir } from '../_shared/pagamento.ts';

servir(confirmarPagamento);
