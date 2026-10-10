// ML Competencia AR — lógica de parseo compartida.
// La usan el content script (navegador) y el chequeo diario (Node, en
// scripts/healthcheck.js), así ambos prueban exactamente los mismos selectores.

(function (root) {
  "use strict";

  const STOPWORDS = new Set([
    "de", "la", "el", "los", "las", "para", "con", "sin", "y", "en", "por", "un", "una", "x"
  ]);

  // Usa las primeras palabras significativas del título: más corto = más
  // resultados; más largo = más preciso. 6 palabras es un buen balance.
  function buildQuery(title) {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
      .slice(0, 6)
      .join(" ");
  }

  function parseArsNumber(text) {
    // "1.234.567" -> 1234567
    const n = Number(String(text).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function priceFromMoneyNode(node) {
    if (!node) return null;
    const fraction = node.querySelector(".andes-money-amount__fraction");
    if (!fraction) return null;
    const cents = node.querySelector(".andes-money-amount__cents");
    const base = parseArsNumber(fraction.textContent);
    if (base == null) return null;
    return cents ? base + Number(cents.textContent) / 100 : base;
  }

  function shippingLabel({ full, free }) {
    if (full) return "Full";
    if (free) return "Gratis";
    return "Normal";
  }

  // Resultados de /sites/MLA/search -> formato común.
  function mapApiResults(results) {
    return results.map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      url: r.permalink,
      shipping: shippingLabel({
        full: r.shipping?.logistic_type === "fulfillment",
        free: !!r.shipping?.free_shipping
      })
    }));
  }

  // El logo de Full es un <svg aria-label="FULL"> dentro del bloque de envío.
  // No se busca "FULL" en el texto de la tarjeta: títulos como "Smart TV FULL HD"
  // daban falsos positivos.
  const SHIPPING_SELECTORS =
    ".poly-component__shipped-from, .poly-component__shipping, .ui-search-item__shipping, .ui-search-item__fulfillment";

  function isFulfillmentCard(card) {
    if (card.querySelector('.ui-search-item__fulfillment, [aria-label="FULL" i], svg[class*="fulfillment" i]')) {
      return true;
    }
    for (const node of card.querySelectorAll(SHIPPING_SELECTORS)) {
      if (/\bfull\b/i.test(node.textContent) || node.querySelector('svg[aria-label*="full" i]')) return true;
    }
    return false;
  }

  // Documento de listado.mercadolibre.com.ar -> formato común.
  function parseSearchDocument(doc) {
    const cards = doc.querySelectorAll("li.ui-search-layout__item, div.poly-card");
    const seen = new Set();
    const out = [];

    for (const card of cards) {
      const link =
        card.querySelector("a.poly-component__title") ||
        card.querySelector("a.ui-search-item__group__element") ||
        card.querySelector("a.ui-search-link") ||
        card.querySelector("a[href*='mercadolibre.com.ar']");
      if (!link) continue;

      let href = link.getAttribute("href") || "";
      try {
        href = new URL(href, "https://listado.mercadolibre.com.ar/").href;
      } catch {
        continue;
      }
      const title = (
        card.querySelector(".poly-component__title, .ui-search-item__title")?.textContent ||
        link.textContent ||
        ""
      ).trim();
      const price = priceFromMoneyNode(
        card.querySelector(".poly-price__current .andes-money-amount") ||
          card.querySelector(".andes-money-amount:not(.andes-money-amount--previous)")
      );
      if (!title || !price) continue;

      const idMatch = href.match(/MLA-?(\d{6,})/i);
      const id = idMatch ? `MLA${idMatch[1]}` : null;
      const key = id || title;
      if (seen.has(key)) continue;
      seen.add(key);

      const text = card.textContent || "";
      const full = isFulfillmentCard(card);
      const free = /env[ií]o gratis|llega gratis/i.test(text);

      out.push({ id, title, price, url: href, shipping: shippingLabel({ full, free }) });
    }
    return out;
  }

  function searchUrl(query) {
    const slug = query.trim().replace(/\s+/g, "-");
    return `https://listado.mercadolibre.com.ar/${encodeURIComponent(slug)}`;
  }

  const api = {
    buildQuery,
    parseArsNumber,
    priceFromMoneyNode,
    shippingLabel,
    mapApiResults,
    isFulfillmentCard,
    parseSearchDocument,
    searchUrl
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MLCParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
