# Cómo crear las páginas del plano en Oracle APEX

El plano usa **tres páginas** en tu aplicación y **tres archivos** (dos `.js` y un `.css`).

| Página | Para quién | Alias (obligatorio) |
|---|---|---|
| Plano de lotes | Clientes, **sin login** | `LOTEAMIENTO` |
| Gestión de lotes | Vendedor, **con login** | el que quieras |
| Vista previa | WhatsApp / Facebook, **sin login** | `LOT-OG` |

> Los alias importan: el código arma los links con `…/loteamiento` y `…/lot-og`. Los números de página pueden ser los que quieras.

---

## 0. Sube los archivos (una sola vez)

**Shared Components → Static Application Files → Create File**. Sube los tres archivos poniendo `lot` en **Directory**:

- [`js/lot-explorer.js`](js/lot-explorer.js) → queda como `lot/lot-explorer.js`
- [`js/lot-admin.js`](js/lot-admin.js) → queda como `lot/lot-admin.js`
- [`css/lot.css`](css/lot.css) → queda como `lot/lot.css`

---

## 1. Página del plano (pública)

1. **Create Page → Blank Page**, nombre *Plano de lotes*, **alias `LOTEAMIENTO`**.
2. En la página:
   - **Appearance → Page Template:** *Minimal (No Navigation)*.
   - **Security → Authentication:** *Page Is Public*.
3. Crea una región **Static Content** con **Template:** *Blank with Attributes (No Grid)* y pega en **Source → HTML Code**:

   ```html
   <div id="lot" class="lt-boot"></div>
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700;800&display=swap">
   <link rel="stylesheet" href="#APP_FILES#lot/lot.css">
   <script defer src="#APP_FILES#lot/lot-explorer.js"></script>
   ```

4. Proceso **Ajax Callback**:
   - **Name:** `AJAX`, en mayúsculas.
   - **Type:** *Execute Code*.
   - **PL/SQL Code:** `LOT000.AJAX_PUBLICO;`

Con esto el plano ya funciona. El paso 5 agrega la vista previa con foto al compartir el link (recomendado).

### 5. Vista previa al compartir (Open Graph)

**a) Ítem de aplicación** (para que `?lote=110` llegue al servidor):
- **Shared Components → Application Items → Create**, nombre **`LOTE`**.
- **Session State Protection:** *Unrestricted*. Sin esto, APEX responde error 400 al abrir un link `?lote=`.

**b) Cinco ítems ocultos en la página del plano** (tipo *Hidden*): `P59_OG_TITULO`, `P59_OG_DESC`, `P59_OG_IMG`, `P59_OG_URL` y `P59_OG_SITIO`. Si tu página no es la 59, usá el prefijo de tu página y cambialo también en los pasos c) y d).

**c) Proceso** antes de dibujar la página:
- **Execution → Point:** *Before Header*.
- **Type:** *Execute Code*.
- **PL/SQL Code:**

  ```sql
  LOT000.OG(:LOTE, :P59_OG_TITULO, :P59_OG_DESC, :P59_OG_IMG, :P59_OG_URL);
  select LOO_NOMBRE into :P59_OG_SITIO from MAP_LOTEO where LOO_CODIGO = 1;
  ```

**d) Etiquetas en la página:** **HTML Header → HTML Header**:

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="&P59_OG_SITIO!HTML.">
<meta property="og:title" content="&P59_OG_TITULO!HTML.">
<meta property="og:description" content="&P59_OG_DESC!HTML.">
<meta property="og:url" content="&P59_OG_URL!RAW.">
<meta property="og:image" content="&P59_OG_IMG!RAW.">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="es_PY">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="&P59_OG_DESC!HTML.">
```

> Las URLs van con `!RAW.` a propósito: `!ATTR.` las escapa como `https&#x3A;&#x2F;&#x2F;…` y algunos lectores de vistas previas no las entienden. `LOT000.OG` ya limpia los caracteres que no son de URL.

---

## 2. Página de la imagen de vista previa (pública)

1. **Blank Page**, nombre *Vista previa*, **alias `LOT-OG`**, **Page Is Public**.
2. Dos ítems **Hidden** con estos nombres exactos (los usa `LOT000`): **`P61_ID`** y **`P61_V`**.
3. Proceso:
   - **Execution → Point:** *Before Header*.
   - **Type:** *Execute Code*.
   - **PL/SQL Code:**

     ```sql
     LOT000.OG_IMAGEN(:P61_ID);
     apex_application.stop_apex_engine;
     ```

La página devuelve directamente la imagen JPG del lote, nada más.

---

## 3. Página de gestión (con login)

1. **Blank Page**, nombre *Gestión de lotes*, con la autenticación normal de tu app. Si tu app tiene un esquema de autorización, ponelo acá.
2. Región **Static Content**, **Template:** *Blank with Attributes (No Grid)*, **HTML Code:**

   ```html
   <div id="lotAdm"><div class="lt-help">Cargando…</div></div>
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700;800&display=swap">
   <link rel="stylesheet" href="#APP_FILES#lot/lot.css">
   <script defer src="#APP_FILES#lot/lot-admin.js"></script>
   ```

3. Proceso **Ajax Callback**:
   - **Name:** `AJAX`.
   - **PL/SQL Code:** `LOT000.AJAX;`

---

## 4. Guarda y ejecuta (▶ Run)

1. Abrí la **gestión**. La primera vez crea una fila en `MAP_LOTE` por cada polígono de `MAP_AREA` con categoría `Lote`.
2. Cargá precios, planes de pago y los datos del loteamiento.
3. En la pestaña *Loteamiento*, pulsá **Generar vistas previas**.
4. El botón **Ver plano público** abre la página de los clientes, y **Copiar link** te da la URL para compartir.

Si el plano aparece en blanco, revisá que:
- la región tenga exactamente `<div id="lot">` (o `<div id="lotAdm">` en la gestión);
- el proceso Ajax se llame **AJAX** y apunte al paquete correcto;
- los archivos estén en `lot/` dentro de *Static Application Files*;
- tu red permita cargar `unpkg.com` (MapLibre GL) y `server.arcgisonline.com` (imagen satelital).

> **Ojo al probar con el mismo navegador:** si abrís el plano público en una pestaña mientras estás logueado en la gestión de la misma app, APEX crea una sesión nueva y te saca de la gestión. Usá el botón **Ver plano público**, que abre el plano con tu sesión, o una ventana privada.
