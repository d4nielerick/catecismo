/**
 * scripts/pagina-hoje.mjs — a página de /liturgiadiaria/ com as leituras de HOJE já no HTML.
 *
 * Por quê: o endereço principal é o que responde a "liturgia de hoje", mas ele chegava ao Google
 * como uma casca ("Buscando leituras do dia…") que o JavaScript preenche. Aqui sai o mesmo HTML das
 * páginas por dia, com o endereço e o título de "hoje". O JavaScript continua redesenhando por cima
 * pela data do aparelho, então ninguém vê diferença.
 *
 *   node scripts/pagina-hoje.mjs        # grava liturgiadiaria/hoje.html (dia de Brasília)
 *
 * O Caddy serve hoje.html no lugar de index.html (e cai no index.html se ele não existir). Na VPS roda
 * de hora em hora (cron, dentro do container catecismo-api), então a virada do dia leva no máximo 1h.
 * hoje.html não vai para o git nem é apagado pelo rsync (ver --exclude no deploy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerModelo, lerIndice, lerDia, paginaDoDia } from './build-paginas-liturgia.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'liturgiadiaria', 'hoje.html');

const dt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
if (!fs.existsSync(path.join(RAIZ, 'data', 'liturgia', `${dt}.json`))) {
  console.error(`sem data/liturgia/${dt}.json: hoje.html não foi atualizado (o index.html segue valendo)`);
  process.exit(1);
}
const html = paginaDoDia(lerModelo(), dt, lerDia(dt), lerIndice(), undefined, { hoje: true });
const tmp = `${SAIDA}.tmp`;
fs.writeFileSync(tmp, html);
fs.renameSync(tmp, SAIDA);   // troca atômica: o servidor nunca lê um arquivo pela metade
console.log(`liturgiadiaria/hoje.html: ${dt} (${Math.round(html.length / 1024)}KB)`);
