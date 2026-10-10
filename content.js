// ML Competencia AR — content script
// Detecta páginas de producto de MercadoLibre Argentina, extrae los datos del
// ítem y busca los 5 competidores más relevantes.
//
// Fuente de datos (en orden):
//   1. API pública de búsqueda: /sites/MLA/search (con token si el usuario lo cargó).
//   2. Fallback: la página de listado pública (listado.mercadolibre.com.ar),
//      parseada con DOMParser. Se usa si la API responde 401/403.
//
// La lectura de resultados vive en parser.js (compartido con el chequeo diario).

(() => {
  "use strict";

  const { buildQuery, priceFromMoneyNode, mapApiResults, parseSearchDocument, searchUrl } = globalThis.MLCParser;

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

  function bgFetch(url, as, token) {
    return chrome.runtime.sendMessage({ type: "ML_FETCH", url, as, token });
  }

  async function searchViaApi(query, token) {
    const url = `https://api.mercadolibre.com/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=20`;
    const res = await bgFetch(url, "json", token);
    if (!res?.ok || !Array.isArray(res.data?.results)) {
      throw new Error(`API ${res?.status || "sin respuesta"}`);
    }
    return mapApiResults(res.data.results);
  }

  async function searchViaHtml(query) {
    const res = await bgFetch(searchUrl(query), "text");
    if (!res?.ok || typeof res.data !== "string") {
      throw new Error(`Listado ${res?.status || "sin respuesta"}`);
    }
    const out = parseSearchDocument(new DOMParser().parseFromString(res.data, "text/html"));
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
