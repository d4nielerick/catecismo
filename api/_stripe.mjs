/**
 * _stripe.mjs — Checkout embutido da Stripe (cartão, Apple Pay, Google Pay) para as doações.
 *
 * Fluxo: POST /api/apoio-stripe { valor } cria uma sessão "embedded" e devolve o client_secret; a
 * página monta o formulário da Stripe na própria janela (Stripe.js). Quando o pagamento fecha, a
 * Stripe avisa /api/apoio-webhook (checkout.session.completed), que soma no registro.
 *
 * Variáveis de ambiente (container catecismo-api, nunca no repositório):
 *   STRIPE_SECRET_KEY      chave restrita (rk_…) com permissão de escrita só em "Checkout Sessions"
 *   STRIPE_WEBHOOK_SECRET  segredo de assinatura do webhook (whsec_…)
 * A chave pública (pk_…) fica em data/apoio.json, porque é pública por natureza.
 */

const API = 'https://api.stripe.com/v1/checkout/sessions';
const VERSAO_API = '2024-06-20';   // fixa: o formato da sessão "embedded" não muda de baixo de nós

/** Cria a sessão e devolve { id, clientSecret }. Só cartão: Apple Pay e Google Pay vêm junto. */
export async function criarSessao(reais, { fetchFn = fetch, chave = process.env.STRIPE_SECRET_KEY } = {}) {
  if (!chave) throw new Error('STRIPE_SECRET_KEY ausente');
  const corpo = new URLSearchParams({
    ui_mode: 'embedded',
    mode: 'payment',
    redirect_on_completion: 'never',
    submit_type: 'donate',
    locale: 'pt-BR',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'brl',
    'line_items[0][price_data][unit_amount]': String(Math.round(reais * 100)),
    'line_items[0][price_data][product_data][name]': 'Apoio à Liturgia Diária',
  });
  const r = await fetchFn(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': VERSAO_API },
    body: corpo,
  });
  if (!r.ok) throw new Error(`Stripe recusou a sessão (${r.status})`);
  const j = await r.json();
  if (!j.client_secret) throw new Error('resposta sem client_secret');
  return { id: j.id, clientSecret: j.client_secret };
}
