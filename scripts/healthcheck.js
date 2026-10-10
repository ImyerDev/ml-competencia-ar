// Chequeo diario: ¿la extensión todavía puede leer la competencia en MercadoLibre?
//
// Hace las mismas búsquedas que la extensión (API y listado web) usando
// parser.js, y falla (exit 1) si MercadoLibre cambió algo y ya no se pueden
// leer resultados. GitHub Actions avisa por mail cuando falla.
//
// Uso: node scripts/healthcheck.js

const fs = require("node:fs");
const { DOMParser } = require("linkedom");
const parser = require("../parser.js");

// Productos con mucha oferta y envío Full, para que un resultado vacío
// signifique "se rompió algo" y no "no hay publicaciones".
const QUERIES = ["auriculares bluetooth", "funda celular", "zapatillas running"];
const MIN_RESULTS = 5;

// Mismo tipo de navegador que usa la extensión.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9"
};

async function checkApi(query) {
  const url = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=20`;
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: "application/json" } });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    const results = parser.mapApiResults(data.results || []).filter((r) => r.price > 0);
    return { ok: results.length >= MIN_RESULTS, results, detail: `${results.length} resultados` };
  } catch (err) {
    return { ok: false, detail: String(err.message || err) };
  }
}

async function checkListado(query) {
  const url = parser.searchUrl(query);
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: "text/html" } });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const html = await res.text();
    const results = parser.parseSearchDocument(new DOMParser().parseFromString(html, "text/html"));
    if (results.length >= MIN_RESULTS) {
      return { ok: true, results, detail: `${results.length} resultados` };
    }
    const blocked = /captcha|account-verification|suspicious|robot/i.test(html);
    return {
      ok: false,
      blocked,
      results,
      detail: blocked
        ? "MercadoLibre pidió verificación (bloqueo al servidor de GitHub, no necesariamente a la extensión)"
        : `solo ${results.length} resultados: probablemente cambiaron los selectores del listado`
    };
  } catch (err) {
    return { ok: false, detail: String(err.message || err) };
  }
}

async function main() {
  const rows = [];
  let working = 0;
  let listadoResults = 0;
  let listadoFull = 0;

  for (const query of QUERIES) {
    const [apiRes, listadoRes] = await Promise.all([checkApi(query), checkListado(query)]);
    if (apiRes.ok || listadoRes.ok) working++;
    if (listadoRes.ok) {
      listadoResults += listadoRes.results.length;
      listadoFull += listadoRes.results.filter((r) => r.shipping === "Full").length;
    }
    rows.push({ query, apiRes, listadoRes });
  }

  const problems = [];
  if (working < QUERIES.length) {
    problems.push(`${QUERIES.length - working} de ${QUERIES.length} búsquedas sin resultados por ninguna vía.`);
  }
  // En estos productos siempre hay publicaciones Full: si no aparece ninguna,
  // se rompió la detección del logo.
  if (listadoResults > 0 && listadoFull === 0) {
    problems.push(`Envío Full detectado 0 veces en ${listadoResults} resultados del listado: revisar isFulfillmentCard.`);
  }

  const icon = (r) => (r.ok ? "✅" : "❌");
  const lines = [
    "## Chequeo diario de ML Competencia AR",
    "",
    "| Búsqueda | API | Listado web |",
    "|---|---|---|",
    ...rows.map(
      (r) => `| ${r.query} | ${icon(r.apiRes)} ${r.apiRes.detail} | ${icon(r.listadoRes)} ${r.listadoRes.detail} |`
    ),
    "",
    `Envío Full detectado en el listado: ${listadoFull} de ${listadoResults} resultados.`,
    "",
    problems.length ? "### ❌ Problemas\n\n" + problems.map((p) => `- ${p}`).join("\n") : "### ✅ Todo funciona",
    "",
    "La API sin token suele responder 401/403; es esperable. Lo que importa es que funcione al menos una de las dos vías."
  ];
  const summary = lines.join("\n");

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

  process.exit(problems.length ? 1 : 0);
}

main();
