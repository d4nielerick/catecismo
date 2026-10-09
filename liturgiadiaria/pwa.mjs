/**
 * pwa.mjs — o site como app: registra o service worker (leitura sem internet) e cuida do convite
 * para instalar. O Chrome (Android e desktop) avisa que dá para instalar com o evento
 * `beforeinstallprompt`; o Safari do iPhone não tem esse aviso, então a instrução é escrita.
 */

import { evento } from '/liturgiadiaria/metricas.mjs';

const pad = n => String(n).padStart(2, '0');
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const jaInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const noIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

// ---- avisos: "Evangelho de hoje" às 6h (Web Push) ----------------------------------------------
// A inscrição fica no navegador e no servidor (/api/push-inscrever); o envio sai de
// scripts/enviar-push.mjs na VPS. No iPhone só funciona com o app instalado (iOS 16.4+).

const API = /(^|\.)santadoutrina\.com$/.test(location.hostname) || location.hostname === 'localhost' ? '/api' : 'https://santadoutrina.com/api';
const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function inscricaoAtual() {
  const reg = await navigator.serviceWorker.getRegistration('/liturgiadiaria/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** 'indisponivel' (navegador sem push), 'bloqueado' (permissão negada), 'desligado' ou 'ligado'. */
export async function estadoAvisos() {
  if (!suportaPush()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  try { return (await inscricaoAtual()) ? 'ligado' : 'desligado'; } catch { return 'desligado'; }
}

/** Pede permissão, inscreve e avisa o servidor. Devolve o estado final ('ligado', 'bloqueado' ou 'erro'). */
export async function ligarAvisos() {
  if (!suportaPush()) return 'indisponivel';
  let inscricao = null;
  try {
    const { chave_publica } = await (await fetch('/data/push.json', { cache: 'no-cache' })).json();
    if ((await Notification.requestPermission()) !== 'granted') return 'bloqueado';
    const reg = await navigator.serviceWorker.ready;   // o registro sai 1,5 s depois do load; aqui espera por ele
    inscricao = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(chave_publica.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) });
    const r = await fetch(`${API}/push-inscrever`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inscricao: inscricao.toJSON() }) });
    if (!r.ok) throw new Error(`servidor ${r.status}`);
    return 'ligado';
  } catch (e) {
    console.warn('[avisos]', e.message);
    await inscricao?.unsubscribe().catch(() => {});   // não deixa o navegador inscrito num aviso que o servidor não conhece
    return 'erro';
  }
}

export async function desligarAvisos() {
  try {
    const inscricao = await inscricaoAtual();
    if (!inscricao) return 'desligado';
    const { endpoint } = inscricao;
    await inscricao.unsubscribe();
    fetch(`${API}/push-cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {});
  } catch (e) { console.warn('[avisos]', e.message); }
  return 'desligado';
}
