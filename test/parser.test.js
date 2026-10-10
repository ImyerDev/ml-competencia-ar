// Pruebas de parser.js contra un listado armado a mano (no necesita red).
// Si cambian los selectores, actualizá también test/fixtures/listado.html.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DOMParser } = require("linkedom");
const parser = require("../parser.js");

const html = fs.readFileSync(path.join(__dirname, "fixtures", "listado.html"), "utf8");
const results = parser.parseSearchDocument(new DOMParser().parseFromString(html, "text/html"));
const byId = Object.fromEntries(results.map((r) => [r.id, r]));

test("lee las 4 tarjetas con precio y descarta la que no tiene", () => {
  assert.equal(results.length, 4);
});

test("detecta Full por el logo, no por el texto del título", () => {
  assert.equal(byId.MLA111111111.shipping, "Full");
  assert.equal(byId.MLA222222222.shipping, "Gratis");
  assert.equal(byId.MLA444444444.shipping, "Full");
  assert.equal(byId.MLA333333333.shipping, "Normal");
});

test("toma el precio actual con centavos, no el tachado", () => {
  assert.equal(byId.MLA111111111.price, 25999);
  assert.equal(byId.MLA222222222.price, 249990.5);
});

test("resuelve links relativos y saca el ID de wid", () => {
  assert.equal(byId.MLA333333333.url, "https://listado.mercadolibre.com.ar/p/MLA333?wid=MLA333333333");
});

test("mapea resultados de la API", () => {
  const [r] = parser.mapApiResults([
    { id: "MLA1", title: "X", price: 10, permalink: "https://x", shipping: { logistic_type: "fulfillment", free_shipping: true } }
  ]);
  assert.deepEqual(r, { id: "MLA1", title: "X", price: 10, url: "https://x", shipping: "Full" });
});

test("arma la búsqueda con las primeras 6 palabras útiles", () => {
  assert.equal(
    parser.buildQuery("Auriculares Inalámbricos Bluetooth para Celular con Micrófono y Estuche"),
    "auriculares inalambricos bluetooth celular microfono estuche"
  );
});
