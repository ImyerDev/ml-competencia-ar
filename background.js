// Service worker: hace las peticiones de red en nombre del content script.
// Los content scripts de MV3 están sujetos al CORS de la página; el service
// worker usa los host_permissions del manifest y no tiene esa restricción.

const ALLOWED_HOSTS = [
  "api.mercadolibre.com",
  "listado.mercadolibre.com.ar",
  "www.mercadolibre.com.ar"
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "ML_FETCH") return false;

  let url;
  try {
    url = new URL(msg.url);
  } catch {
    sendResponse({ ok: false, status: 0, error: "URL inválida" });
    return false;
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.hostname)) {
    sendResponse({ ok: false, status: 0, error: "Host no permitido" });
    return false;
  }

  const headers = { Accept: msg.as === "text" ? "text/html" : "application/json" };
  if (msg.token && url.hostname === "api.mercadolibre.com") {
    headers.Authorization = `Bearer ${msg.token}`;
  }

  fetch(url.toString(), { headers, credentials: "omit" })
    .then(async (res) => {
      const data = msg.as === "text" ? await res.text() : await res.json().catch(() => null);
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => sendResponse({ ok: false, status: 0, error: String(err) }));

  return true; // respuesta asíncrona
});
