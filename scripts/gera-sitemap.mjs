#!/usr/bin/env node
/**
 * gera-sitemap.mjs
 * Gera sitemap.xml na raiz do projeto de forma determinística (sem rede).
 *
 * Inclui:
 *   - as páginas estáticas do site (/, /saopiox/, /liturgiadiaria/, /perguntas/)
 *   - uma URL /perguntas/{slug} para cada entrada de data/perguntas/_indice.json
 *
 * lastmod = data da execução deste script (UTC, formato YYYY-MM-DD).
 *
 * Uso: node scripts/gera-sitemap.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INDICE_PATH = path.join(ROOT, 'data/perguntas/_indice.json');
const OUT_PATH = path.join(ROOT, 'sitemap.xml');

const BASE_URL = 'https://santadoutrina.cloud';

const PAGINAS_ESTATICAS = [
  { path: '/',               changefreq: 'weekly',  priority: '1.0' },
  { path: '/saopiox/',        changefreq: 'weekly',  priority: '0.8' },
  { path: '/liturgiadiaria/', changefreq: 'daily',   priority: '0.8' },
  { path: '/perguntas/',      changefreq: 'weekly',  priority: '0.7' },
];

function hoje() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

function main() {
  const indice = JSON.parse(fs.readFileSync(INDICE_PATH, 'utf-8'));
  if (!Array.isArray(indice) || indice.length === 0) {
    throw new Error('_indice.json vazio ou inválido');
  }

  const lastmod = hoje();
  const entries = [];

  for (const { path: p, changefreq, priority } of PAGINAS_ESTATICAS) {
    entries.push(urlEntry(`${BASE_URL}${p}`, lastmod, changefreq, priority));
  }

  for (const { slug } of indice) {
    entries.push(urlEntry(`${BASE_URL}/perguntas/${slug}`, lastmod, 'monthly', '0.6'));
  }

  // documentos-fonte hospedados (/fontes/{slug}), se houver
  const fontesPath = path.join(ROOT, 'data/fontes-index.json');
  let nFontes = 0;
  if (fs.existsSync(fontesPath)) {
    const fontes = JSON.parse(fs.readFileSync(fontesPath, 'utf-8'));
    for (const { slug } of fontes) {
      entries.push(urlEntry(`${BASE_URL}/fontes/${slug}`, lastmod, 'yearly', '0.6'));
      nFontes++;
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  fs.writeFileSync(OUT_PATH, xml, 'utf-8');
  console.log(`sitemap.xml gerado com ${PAGINAS_ESTATICAS.length + indice.length + nFontes} URLs (${lastmod}).`);
}

main();
