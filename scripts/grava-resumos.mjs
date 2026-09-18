/**
 * scripts/grava-resumos.mjs — grava resumos das leituras em data/liturgia-resumos/AAAA-MM-DD.json.
 *
 *   node scripts/grava-resumos.mjs resumos.json     # { "AAAA-MM-DD": "a primeira leitura (…) …", … }
 *
 * Cada arquivo guarda o texto (sem o "Hoje,"/"Neste dia,", que a página acrescenta) e as referências
 * das leituras que ele resume. Se as leituras daquele dia mudarem, o resumo deixa de aparecer e
 * verifica-liturgia.mjs aponta. Os textos são escritos fora do site (hoje, por Claude nesta máquina)
 * e revisados; nada chama IA em tempo de execução.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenciasDoDia } from '../liturgiadiaria/render.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'data', 'liturgia-resumos');

const entrada = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
fs.mkdirSync(SAIDA, { recursive: true });
let n = 0;
for (const [data, texto] of Object.entries(entrada).sort()) {
  const dia = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'liturgia', `${data}.json`), 'utf8'));
  const resumo = { data, leituras: referenciasDoDia(dia), texto: texto.trim() };
  fs.writeFileSync(path.join(SAIDA, `${data}.json`), `${JSON.stringify(resumo, null, 2)}\n`);
  n++;
}
console.log(`data/liturgia-resumos: ${n} resumo(s) gravado(s)`);
