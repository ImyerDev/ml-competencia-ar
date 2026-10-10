// ML Competencia AR — popup
// Pide el análisis al content script de la pestaña activa y lo muestra.

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const status = $("status");
  status.hidden = !text;
  status.textContent = text || "";
  status.className = isError ? "mlc-error" : "mlc-muted";
}

function td(content, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (content instanceof Node) cell.append(content);
  else cell.textContent = content;
  return cell;
}

function render(data) {
  const { product, competitors, average, source, query } = data;

  $("product-title").textContent = product.title;
  $("current-price").textContent = product.price ? money.format(product.price) : "—";
  $("avg-price").textContent = average ? money.format(average) : "—";

  const diff = $("diff");
  diff.replaceChildren();
  if (product.price && average) {
    const pct = ((product.price - average) / average) * 100;
    const badge = document.createElement("span");
    badge.className =
      "mlc-badge " + (pct > 5 ? "mlc-badge--up" : pct < -5 ? "mlc-badge--down" : "mlc-badge--even");
    badge.textContent =
      `${pct > 0 ? "+" : ""}${pct.toFixed(1)}% vs. promedio` +
      (pct > 5 ? " (más caro)" : pct < -5 ? " (más barato)" : " (en línea)");
    diff.append(badge);
  }

  const tbody = $("competitors");
  tbody.replaceChildren();
  if (!competitors.length) {
    const row = document.createElement("tr");
    const cell = td("No se encontraron competidores para este producto.");
    cell.colSpan = 4;
    row.append(cell);
    tbody.append(row);
  }
  for (const c of competitors) {
    const row = document.createElement("tr");

    const title = td(c.title, "title");
    title.title = c.title;

    const ship = document.createElement("span");
    ship.className = `mlc-ship mlc-ship--${c.shipping.toLowerCase()}`;
    ship.textContent = c.shipping;

    const link = document.createElement("a");
    link.href = c.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Ver ↗";

    row.append(title, td(money.format(c.price), "num"), td(ship), td(link));
    tbody.append(row);
  }

  $("source").textContent = source === "api" ? "Fuente: API MercadoLibre" : "Fuente: listado web";
  $("query").textContent = `Búsqueda: "${query}"`;
  $("result").hidden = false;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function run(force = false) {
  $("result").hidden = true;
  setStatus("Analizando competencia…");

  const tab = await getActiveTab();
  if (!tab?.url || !/^https:\/\/([a-z]+\.)?mercadolibre\.com\.ar\//.test(tab.url)) {
    setStatus("Abrí una página de producto de MercadoLibre Argentina para usar la extensión.", true);
    return;
  }

  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "ML_ANALYZE", force });
  } catch {
    setStatus("Recargá la página del producto (F5) y volvé a abrir la extensión.", true);
    return;
  }

  if (!res?.ok) {
    setStatus(res?.error || "Error desconocido.", true);
    return;
  }
  setStatus("");
  render(res.data);
}

async function initSettings() {
  const { mlAccessToken } = await chrome.storage.local.get("mlAccessToken");
  $("token").value = mlAccessToken || "";

  $("settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = $("token").value.trim();
    if (value) await chrome.storage.local.set({ mlAccessToken: value });
    else await chrome.storage.local.remove("mlAccessToken");
    run(true);
  });
}

$("refresh").addEventListener("click", () => run(true));
initSettings();
run();
