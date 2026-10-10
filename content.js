// ML Competencia AR — content script
// Detecta páginas de producto de MercadoLibre Argentina, extrae los datos del
// ítem y busca los 5 competidores más relevantes.
//
// Fuente de datos (en orden):
//   1. API pública de búsqueda: /sites/MLA/search (con token si el usuario lo cargó).
//   2. Fallback: la página de listado pública (listado.mercadolibre.com.ar),
//      parseada con DOMParser. Se usa si la API responde 401/403.

(() => {
  "use strict";

  const SITE = "MLA";
  const TOP_N = 5;
  const money = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });

  // ---------------------------------------------------------------------------
  // Detección y extracción del producto actual
  // ---------------------------------------------------------------------------

  function getItemId() {
    const params = new URLSearchParams(location.search);
    for (const key of ["item_id", "wid"]) {
      const v = params.get(key);
      if (v && /^MLA\d+$/i.test(v)) return v.toUpperCase();
    }
    const m = location.pathname.match(/MLA-?(\d{6,})/i);
    return m ? `MLA${m[1]}` : null;
  }

  function isCatalogPage() {
    return /\/p\/MLA\d+/i.test(location.pathname);
  }

  function getTitle() {
    const h1 = document.querySelector("h1.ui-pdp-title, h1");
    const og = document.querySelector('meta[property="og:title"]');
    return (h1?.textContent || og?.content || "").trim();
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

  function getPrice() {
    const meta = document.querySelector('meta[itemprop="price"]');
    if (meta?.content && Number(meta.content) > 0) return Number(meta.content);
    const node =
      document.querySelector(".ui-pdp-price__second-line .andes-money-amount") ||
      document.querySelector(".ui-pdp-price .andes-money-amount");
    return priceFromMoneyNode(node);
  }

  function isProductPage() {
    const urlLooksLikeItem =
      location.hostname === "articulo.mercadolibre.com.ar" || isCatalogPage() || !!getItemId();
    return urlLooksLikeItem && !!document.querySelector(".ui-pdp-title, .ui-pdp-container");
  }

  function getProduct() {
    return {
      id: getItemId(),
      title: getTitle(),
      price: getPrice(),
      url: location.href.split("#")[0]
    };
  }

  // ---------------------------------------------------------------------------
  // Búsqueda de competidores
  // ---------------------------------------------------------------------------

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

  function bgFetch(url, as, token) {
    return chrome.runtime.sendMessage({ type: "ML_FETCH", url, as, token });
  }

  function shippingLabel({ full, free }) {
    if (full) return "Full";
    if (free) return "Gratis";
    return "Normal";
  }

  async function searchViaApi(query, token) {
    const url = `https://api.mercadolibre.com/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=20`;
    const res = await bgFetch(url, "json", token);
    if (!res?.ok || !Array.isArray(res.data?.results)) {
      throw new Error(`API ${res?.status || "sin respuesta"}`);
    }
    return res.data.results.map((r) => ({
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

  async function searchViaHtml(query) {
    const slug = query.trim().replace(/\s+/g, "-");
    const res = await bgFetch(`https://listado.mercadolibre.com.ar/${encodeURIComponent(slug)}`, "text");
    if (!res?.ok || typeof res.data !== "string") {
      throw new Error(`Listado ${res?.status || "sin respuesta"}`);
    }
    const doc = new DOMParser().parseFromString(res.data, "text/html");
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

      const href = link.href || link.getAttribute("href") || "";
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
      const full =
        !!card.querySelector('[aria-label*="full" i], .ui-search-item__fulfillment, svg[class*="full" i]') ||
        /\bFULL\b/.test(text);
      const free = /env[ií]o gratis|llega gratis/i.test(text);

      out.push({ id, title, price, url: href, shipping: shippingLabel({ full, free }) });
    }
    if (!out.length) throw new Error("No se pudieron leer resultados del listado");
    return out;
  }

  async function getToken() {
    try {
      const { mlAccessToken } = await chrome.storage.local.get("mlAccessToken");
      return mlAccessToken || null;
    } catch {
      return null;
    }
  }

  let cache = { href: null, promise: null };

  function analyze(force = false) {
    if (!force && cache.href === location.href && cache.promise) return cache.promise;
    cache = { href: location.href, promise: runAnalysis() };
    cache.promise.catch(() => (cache = { href: null, promise: null }));
    return cache.promise;
  }

  async function runAnalysis() {
    if (!isProductPage()) throw new Error("Esta no es una página de producto de MercadoLibre.");
    const product = getProduct();
    if (!product.title) throw new Error("No se pudo leer el título del producto.");

    const query = buildQuery(product.title);
    const token = await getToken();
    const errors = [];
    let results = null;
    let source = null;

    try {
      results = await searchViaApi(query, token);
      source = "api";
    } catch (e) {
      errors.push(e.message);
    }
    if (!results) {
      try {
        results = await searchViaHtml(query);
        source = "web";
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (!results) throw new Error(`No se pudo buscar competencia (${errors.join(" / ")}).`);

    const normTitle = product.title.trim().toLowerCase();
    const competitors = results
      .filter((r) => r.price > 0)
      .filter((r) => (product.id ? r.id !== product.id : true))
      .filter((r) => r.title.trim().toLowerCase() !== normTitle)
      .slice(0, TOP_N);

    const average = competitors.length
      ? competitors.reduce((sum, c) => sum + c.price, 0) / competitors.length
      : null;

    return { product, competitors, average, query, source, analyzedAt: Date.now() };
  }

  // ---------------------------------------------------------------------------
  // Mensajes desde el popup
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "ML_PING") {
      sendResponse({ isProduct: isProductPage() });
      return false;
    }
    if (msg?.type === "ML_ANALYZE") {
      analyze(!!msg.force)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    return false;
  });

  // ---------------------------------------------------------------------------
  // Panel flotante dentro de la página
  // ---------------------------------------------------------------------------

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
      if (child != null) node.append(child);
    }
    return node;
  }

  function diffBadge(price, average) {
    if (!price || !average) return null;
    const pct = ((price - average) / average) * 100;
    const cls = pct > 5 ? "mlc-badge--up" : pct < -5 ? "mlc-badge--down" : "mlc-badge--even";
    const sign = pct > 0 ? "+" : "";
    return el("span", { class: `mlc-badge ${cls}`, text: `${sign}${pct.toFixed(1)}% vs. promedio` });
  }

  function renderPanelBody(body, data) {
    body.replaceChildren(
      el("div", { class: "mlc-stats" }, [
        el("div", { class: "mlc-stat" }, [
          el("span", { class: "mlc-stat__label", text: "Tu precio" }),
          el("strong", { class: "mlc-stat__value", text: data.product.price ? money.format(data.product.price) : "—" })
        ]),
        el("div", { class: "mlc-stat" }, [
          el("span", { class: "mlc-stat__label", text: "Promedio competencia" }),
          el("strong", { class: "mlc-stat__value", text: data.average ? money.format(data.average) : "—" })
        ])
      ]),
      diffBadge(data.product.price, data.average),
      el(
        "ol",
        { class: "mlc-list" },
        data.competitors.map((c) =>
          el("li", {}, [
            el("a", { href: c.url, target: "_blank", rel: "noopener noreferrer", text: c.title }),
            el("span", { class: "mlc-list__meta" }, [
              el("span", { text: money.format(c.price) }),
              el("span", { class: `mlc-ship mlc-ship--${c.shipping.toLowerCase()}`, text: c.shipping })
            ])
          ])
        )
      )
    );
  }

  function mountPanel() {
    if (!isProductPage() || document.getElementById("mlc-root")) return;

    const body = el("div", { class: "mlc-panel__body" });
    const panel = el("div", { class: "mlc-panel", hidden: "" }, [
      el("div", { class: "mlc-panel__header" }, [
        el("span", { text: "Competencia" }),
        el("button", { class: "mlc-close", type: "button", "aria-label": "Cerrar", text: "×" })
      ]),
      body
    ]);
    const toggle = el("button", { class: "mlc-fab", type: "button", text: "📊 Competencia" });
    const root = el("div", { id: "mlc-root" }, [panel, toggle]);

    toggle.addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) return;
      body.replaceChildren(el("p", { class: "mlc-muted", text: "Analizando competencia…" }));
      try {
        renderPanelBody(body, await analyze());
      } catch (err) {
        body.replaceChildren(el("p", { class: "mlc-error", text: err.message }));
      }
    });
    panel.querySelector(".mlc-close").addEventListener("click", () => (panel.hidden = true));

    document.body.append(root);
  }

  mountPanel();
})();
