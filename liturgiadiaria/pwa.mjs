/**
 * pwa.mjs — o site como app: registra o service worker (leitura sem internet) e cuida do convite
 * para instalar. O Chrome (Android e desktop) avisa que dá para instalar com o evento
 * `beforeinstallprompt`; o Safari do iPhone não tem esse aviso, então a instrução é escrita.
 */

import { evento } from '/liturgiadiaria/metricas.mjs';

const pad = n => String(n).padStart(2, '0');
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const jaInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const noIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let convite = null;          // o evento do Chrome, guardado até a pessoa tocar em "Instalar"
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(f => f());

// escuta desde o carregamento do módulo: o aviso pode chegar antes de o menu existir
addEventListener('beforeinstallprompt', e => { e.preventDefault(); convite = e; avisar(); });
addEventListener('appinstalled', () => { convite = null; evento('pwa-instalado'); avisar(); });

/** O que o menu deve mostrar: 'botao' (dá para instalar agora), 'ios' (instrução) ou 'nada'. */
export function modoInstalacao() {
  if (jaInstalado()) return 'nada';
  if (convite) return 'botao';
  if (noIphone()) return 'ios';
  return 'nada';
}

export function aoMudarInstalacao(f) { ouvintes.add(f); }

export async function instalar() {
  if (!convite) return;
  const e = convite;
  convite = null;
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'erro' }));
  evento('pwa-instalar', { resultado: outcome });
  avisar();
}

/** Registra o service worker sem competir com o carregamento e deixa os próximos dias prontos. */
export function registrarServiceWorker() {
  if (jaInstalado()) {   // uma vez por sessão: quantas aberturas vêm do app instalado
    try { if (!sessionStorage.getItem('lp-app-aberto')) { sessionStorage.setItem('lp-app-aberto', '1'); evento('pwa-aberto'); } } catch { /* sem sessionStorage */ }
  }
  if (!('serviceWorker' in navigator)) return;
  const iniciar = async () => {
    try {
      await navigator.serviceWorker.register('/liturgiadiaria/sw.js', { scope: '/liturgiadiaria/' });
      const pronto = await navigator.serviceWorker.ready;
      pronto.active?.postMessage({ tipo: 'aquecer', hoje: hojeLocal() });
    } catch { /* sem service worker o site funciona igual, só não abre offline */ }
  };
  if (document.readyState === 'complete') setTimeout(iniciar, 1500);
  else addEventListener('load', () => setTimeout(iniciar, 1500), { once: true });
}
