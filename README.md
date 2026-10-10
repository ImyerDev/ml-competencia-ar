# 📊 ML Competencia AR

Extensión gratuita y de código abierto para Google Chrome (Manifest V3) que analiza la competencia de cualquier producto de **MercadoLibre Argentina** sin salir de la página.

En una publicación muestra:

- El **precio del producto** que estás viendo.
- El **precio promedio** de los 5 competidores más relevantes.
- Cuánto más caro o más barato está tu precio respecto al promedio.
- Una **tabla de competidores** con título, precio, tipo de envío (**Full**, Gratis o Normal) y enlace directo.

---

## 1. Descargar el proyecto

**Opción A: con Git**

```bash
git clone https://github.com/ImyerDev/ml-competencia-ar.git
```

**Opción B: sin Git**

1. Entrá a <https://github.com/ImyerDev/ml-competencia-ar>.
2. Hacé clic en **Code → Download ZIP**.
3. Descomprimí el ZIP en una carpeta que no vayas a borrar (Chrome carga la extensión desde ahí).

## 2. Instalar en Chrome (Modo Desarrollador)

1. Abrí Chrome y andá a `chrome://extensions`.
2. Activá **Modo de desarrollador** (arriba a la derecha).
3. Hacé clic en **Cargar descomprimida**.
4. Elegí la carpeta del proyecto (la que tiene el `manifest.json`).
5. Opcional: fijá la extensión con el ícono de la pieza de rompecabezas 🧩 → 📌.

Si actualizás el código, volvé a `chrome://extensions` y tocá el botón ↻ de la extensión.

## 3. Uso

1. Abrí cualquier publicación de MercadoLibre Argentina, por ejemplo `https://articulo.mercadolibre.com.ar/MLA-...`.
2. Usá cualquiera de las dos vistas:
   - **Popup:** hacé clic en el ícono de la extensión en la barra de Chrome.
   - **Panel flotante:** hacé clic en el botón **📊 Competencia**, abajo a la derecha de la página.
3. El botón ↻ del popup vuelve a hacer el análisis.

> Si tenías la página abierta antes de instalar la extensión, recargala (F5).

## 4. Cómo funciona

1. `content.js` detecta que estás en una página de producto y lee el ID (`MLA...`), el título y el precio.
2. Arma una búsqueda con las primeras 6 palabras significativas del título.
3. Consulta la **API pública de búsqueda** de MercadoLibre (`/sites/MLA/search`).
4. Si la API rechaza la consulta sin autenticación (401/403), lee el **listado web público** (`listado.mercadolibre.com.ar`).
5. Descarta tu propia publicación, toma los 5 primeros resultados por relevancia y calcula el promedio.

`background.js` hace las peticiones de red, porque en Manifest V3 los content scripts están sujetos al CORS de la página.

### Token opcional

MercadoLibre viene restringiendo la búsqueda sin autenticación en su API. Si querés usar la API en lugar del listado web (más estable ante cambios de diseño):

1. Creá una aplicación en <https://developers.mercadolibre.com.ar/devcenter>.
2. Generá un *access token* (dura 6 horas).
3. Pegalo en el popup, en **Configuración (opcional)**, y tocá **Guardar**.

El token se guarda solo en tu navegador (`chrome.storage.local`) y únicamente se envía a `api.mercadolibre.com`.

## 5. Estructura

```
├── manifest.json   # Configuración MV3, permisos y content scripts
├── background.js   # Service worker: hace los fetch (evita CORS)
├── parser.js       # Lectura de resultados (compartida con el chequeo diario)
├── content.js      # Detección del producto, búsqueda y panel flotante
├── popup.html      # Interfaz del popup
├── popup.js        # Lógica del popup
├── styles.css      # Estilos compartidos (popup + panel)
├── scripts/healthcheck.js       # Chequeo diario contra MercadoLibre
├── test/                        # Pruebas del parser (sin red)
└── .github/workflows/healthcheck.yml
```

## Chequeo diario automático

Todos los días a las 8:17 (hora de Argentina) GitHub Actions busca productos reales en MercadoLibre con el mismo código que usa la extensión (`parser.js`). Si MercadoLibre cambia su sitio y la extensión deja de leer resultados o de detectar el envío Full, el chequeo falla y GitHub manda un mail al dueño del repositorio.

- Resultado: pestaña **Actions** → **Chequeo diario de MercadoLibre**.
- Para correrlo a mano: **Actions** → **Chequeo diario de MercadoLibre** → **Run workflow**.
- GitHub pausa los chequeos programados si el repo pasa 60 días sin cambios; avisa por mail y se reactiva con un clic.

Para correr las pruebas en tu PC: `npm install` y `npm test`. No cargues en Chrome una carpeta que tenga `node_modules`: Chrome rechaza algunos archivos de esa carpeta. Usá el ZIP descargado de GitHub o borrá `node_modules` antes.

## 6. Limitaciones conocidas

- **"Relevante" = orden de relevancia de MercadoLibre** para el título del producto. Con títulos muy genéricos pueden aparecer productos no comparables.
- **Páginas de catálogo** (`/p/MLA...`): el precio que se toma es el del ganador del catálogo.
- **Listado web:** si MercadoLibre cambia su HTML, el fallback puede dejar de leer resultados. En ese caso, actualizá los selectores de `searchViaHtml` en `content.js` o usá un token.
- No se guarda historial: cada análisis es una foto del momento.

## 7. Contribuir

Los *issues* y *pull requests* son bienvenidos. Licencia MIT: usala, modificala y compartila libremente.
