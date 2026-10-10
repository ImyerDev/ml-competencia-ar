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
├── parser.js       # Lectura de resultados (compartida con el chequeo)
├── content.js      # Detección del producto, búsqueda y panel flotante
├── popup.html      # Interfaz del popup
├── popup.js        # Lógica del popup
├── styles.css      # Estilos compartidos (popup + panel)
├── scripts/healthcheck.js       # Chequeo contra MercadoLibre real
├── test/                        # Pruebas del parser (sin red)
└── .github/workflows/healthcheck.yml
```

## Pruebas y chequeo contra MercadoLibre

- **Pruebas del parser** (`test/`): corren solas en GitHub Actions en cada cambio. Verifican la lectura de resultados con un listado de ejemplo, sin conexión.
- **Chequeo contra el sitio real** (`scripts/healthcheck.js`): busca productos reales con el mismo código que usa la extensión (`parser.js`). Se corre a mano: **Actions** → **Chequeo de MercadoLibre** → **Run workflow**.
  - MercadoLibre bloquea las búsquedas que vienen de los servidores de GitHub: la API responde 403 y el listado pide verificación. Por eso no corre todos los días; fallaría siempre aunque la extensión funcione.
  - En una PC normal sí funciona: `npm install` y `npm run healthcheck`.

Para correr las pruebas en tu PC: `npm install` y `npm test`. No cargues en Chrome una carpeta que tenga `node_modules`: Chrome rechaza algunos archivos de esa carpeta. Usá el ZIP descargado de GitHub o borrá `node_modules` antes.

## 6. Limitaciones conocidas

- **"Relevante" = orden de relevancia de MercadoLibre** para el título del producto. Con títulos muy genéricos pueden aparecer productos no comparables.
- **Páginas de catálogo** (`/p/MLA...`): el precio que se toma es el del ganador del catálogo.
- **Listado web:** si MercadoLibre cambia su HTML, el fallback puede dejar de leer resultados. En ese caso, actualizá los selectores de `searchViaHtml` en `content.js` o usá un token.
- No se guarda historial: cada análisis es una foto del momento.

## Reportar un problema

Si la extensión no puede leer la competencia, el mensaje de error muestra el botón **Avisar que no funciona**, tanto en el popup como en el panel flotante. Debajo de la tabla también está el link **¿Algún dato se ve mal? Reportalo**.

Los dos abren un reporte nuevo en GitHub, ya completo con el error, la página (sin parámetros de seguimiento), la búsqueda y la versión. Para enviarlo hace falta una cuenta de GitHub, que es gratis. El dueño del repositorio recibe un mail con cada reporte.

## 7. Contribuir

Los *issues* y *pull requests* son bienvenidos. Licencia MIT: usala, modificala y compartila libremente.
