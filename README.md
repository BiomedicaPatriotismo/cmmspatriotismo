# CMMS Biomédico — HSAIP

Sistema de gestión de mantenimiento de equipo médico.
Ingeniería Biomédica y Tecnovigilancia · Hospital San Ángel Inn Patriotismo

## Archivos

| Archivo | Destino |
|---|---|
| `index.html` | GitHub Pages (raíz del repositorio) |
| `Codigo.gs` | Editor de Google Apps Script |

---

## Instalación

### 1. Backend (Google Apps Script)

1. Abre tu hoja de cálculo → **Extensiones → Apps Script**
2. Borra todo el contenido y pega `Codigo.gs`
3. En la **línea 27**, sustituye `PEGA_AQUI_EL_ID_DE_TU_HOJA` por el ID de tu hoja.
   El ID está en la URL: `docs.google.com/spreadsheets/d/`**`ESTE_ES_EL_ID`**`/edit`
4. Ejecuta la función `pruebaConexion` una vez y autoriza los permisos.
   Revisa el registro: debe listar tus hojas y encabezados.
5. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**  ← crítico
6. Copia la URL `/exec` generada.

> Cada vez que edites el script debes crear una **nueva versión** de la
> implementación, o los cambios no se reflejarán.

### 2. Frontend

En `index.html`, línea ~114, pega la URL en `GOOGLE_SHEETS_WEBAPP_URL`.
Sube el archivo al repositorio y activa GitHub Pages.

---

## Correcciones aplicadas (Rev. 02)

| # | Problema | Solución |
|---|---|---|
| 01 | Apps Script no envía encabezados CORS; el navegador bloqueaba la respuesta y el inventario quedaba vacío sin aviso | Transporte JSONP |
| 02 | `getActiveSpreadsheet()` devuelve null en Web App | `openById()` |
| 03 | `normalizeHeader` convertía `ÚLTIMO MANTENIMIENTO` en `uLTIMOMANTENIMIENTO`; el calendario no encontraba los campos y filtraba todo | Mapa explícito de encabezados |
| 04 | Fechas llegaban como ISO (`2026-03-15T06:00:00Z`) y `split('-')` daba mes 15 | Formato forzado `yyyy-MM` |
| 05 | Escrituras simultáneas se sobrescribían | `LockService` |
| 06 | `id: "Propio-undefined"` provocaba edición de la fila equivocada | ID garantizado + `_fila` |
| 07 | Errores silenciados en `catch` | Banner visible + reintentos + rollback |

## Integración Rev. 04 — Inventario con área, paginación y alta con folio automático

| # | Cambio | Detalle |
|---|---|---|
| 08 | La hoja de Inventario no mostraba dónde está cada equipo ni permitía filtrar por eso | Columna **ÁREA** (Ubicación Física) visible en la tabla + filtro desplegable, con "Todas" siempre primero en la lista |
| 09 | Con 1,000+ equipos por hoja, la tabla se renderizaba completa y saturaba la pantalla | Paginación de **30 en 30** con botones Atrás / Siguiente (se deshabilitan solos en los extremos); cualquier cambio de filtro, búsqueda u hoja regresa a la página 1 |
| 10 | El Núm. de Inventario se escribía a mano en "Agregar Equipo", sin relación con el consecutivo real de cada hoja | Folio **autogenerado** (PAT/CPAT/RPAT + consecutivo). El formulario muestra una vista previa que se recalcula al cambiar de hoja; el valor definitivo lo asigna el **servidor** dentro del mismo `LockService` que ya protege las escrituras, para que dos altas simultáneas nunca produzcan folios duplicados |
| 11 | Nivel de Riesgo era texto libre (podía capturarse cualquier cosa) | Ahora es una lista desplegable **I / II / III** en el alta y en la edición; si un registro antiguo tenía otro valor, la edición lo conserva como opción adicional en vez de perderlo silenciosamente |
| 12 | El banner de errores (`BannerEstado`) solo aparecía en la pestaña Calendarios | Se agregó también a Inventario, que es donde realmente ocurren los errores de alta/validación |

**Importante para desplegar:** después de subir el nuevo `Codigo.gs`, hay que crear una **nueva versión** de la implementación de Apps Script (Implementar → Gestionar implementaciones → Editar → Nueva versión), o el backend seguirá corriendo la lógica anterior y el folio se seguirá calculando solo en el navegador.

## Integración Rev. 05 — Indicadores en el mismo libro + control de accesos

| # | Cambio | Detalle |
|---|---|---|
| 13 | El dashboard de Indicadores leía un **CSV publicado en la web** (visible para cualquiera con la URL) de otro libro distinto al inventario | Nueva hoja **`Indicadores`** en el **mismo libro** del inventario. Los datos viajan en el mismo `getAll` (una sola llamada, una sola fuente). La hoja **se crea sola** con todos los encabezados la primera vez que se sincroniza; solo hay que capturar una fila por mes. Ya se puede **des-publicar** el CSV (Archivo → Compartir → Publicar en la web → Dejar de publicar) |
| 14 | Cualquiera con la URL de la web app podía leer y escribir todo el inventario | **Control de acceso por PIN**: pantalla de inicio de sesión en el frontend, validación en el **servidor** (`CLAVES_ACCESO` en `Codigo.gs`). Un PIN por persona → el servidor resuelve el nombre a partir del PIN, así el cliente no puede suplantar a nadie |
| 15 | No había manera de saber quién entraba (o intentaba entrar) al sistema | Nueva hoja **`Accesos`** (se crea sola): registra **cada intento** —permitido o denegado— con fecha/hora, resultado, evento (LOGIN / LECTURA / ESCRITURA), usuario, acción y navegador. Los PIN fallidos se guardan **enmascarados** (primer carácter + longitud), nunca completos |
| 16 | La hoja `Auditoria` registraba el usuario que el navegador declaraba (falsificable) | Las altas y ediciones ahora registran al **usuario autenticado** resuelto por el servidor a partir del PIN |
| 17 | `getAll` abría el libro de Sheets 5–6 veces por petición | `getLibro()` con caché por ejecución: se abre **una vez** (respuesta más rápida) |
| 18 | Borrar el campo "Año" del dashboard o del calendario dejaba `NaN` y vaciaba todo | Los inputs de año ignoran valores no numéricos |
| 19 | Cambiar Estatus/Motivo desde la ficha del equipo no revertía la pantalla si el guardado fallaba | Esos dos guardados rápidos ahora también hacen **rollback** |
| 20 | La hoja `Indicadores` vacía dejaba el spinner de "Cargando indicadores..." girando para siempre | Estado propio de "Sin indicadores capturados" con instrucciones |
| 21 | El histórico del dashboard dependía del orden de captura de las filas | Los meses se ordenan por **calendario** (enero → diciembre) sin importar el orden en la hoja |

### Configuración de la Rev. 05

1. **PINs** — En `Codigo.gs`, sección `CLAVES_ACCESO`, cambia los PIN de ejemplo
   (`CAMBIAME-1234`...) por los reales, uno por persona:
   ```javascript
   var CLAVES_ACCESO = {
     'mi-pin-secreto': 'Ing. Omar (Jefe Biomédica)',
     'otro-pin':       'Técnico Biomédico 1'
   };
   ```
   Los PIN viven **solo en el script** (tu cuenta de Google). El `index.html`
   publicado en GitHub Pages nunca los contiene.
2. **Hoja Indicadores** — No hay que crear nada a mano: la primera sincronización
   la crea con sus 28 columnas (`mes`, `mp_cumplimiento`, `mttr`,
   `downtime_*`, `presupuesto_*`, `ratio_mp`, `ratio_mc`, `reto1..5_titulo/desc/tipo`).
   Captura una fila por mes con el mes en **minúsculas** (`enero`, `febrero`...).
   También puedes ejecutar `inicializarIndicadores` desde el editor.
   Si ya tienes datos en el CSV viejo, cópialos tal cual: las columnas son idénticas.
3. **Desactivar seguridad para pruebas** — `SEGURIDAD_ACTIVA = false` restaura el
   comportamiento abierto de la Rev. 04 (no recomendado en producción).
4. **Nueva versión de la implementación** — igual que siempre: Implementar →
   Gestionar implementaciones → Editar → **Nueva versión**. Sin este paso el
   backend seguirá en Rev. 04 y el login fallará.

### Alcance honesto de la seguridad

- Lo que **sí** hace: nadie sin PIN puede leer ni escribir datos; todo intento
  queda registrado con fecha, resultado y navegador; los nombres en Auditoría,
  Bitácora y Accesos salen del PIN validado en servidor.
- Lo que **no** puede hacer (limitación de Apps Script con acceso "Cualquier
  usuario"): registrar la **dirección IP** ni la cuenta de Google del visitante —
  Google no expone esos datos al script en este modo de despliegue. Si algún día
  necesitas identidad Google real, habría que desplegar con acceso restringido a
  cuentas del dominio, lo que rompería el acceso anónimo desde GitHub Pages.
- El PIN viaja como parámetro de la petición (HTTPS). Es un control razonable
  para un equipo interno; no sustituye una autenticación corporativa formal.

## Integración Rev. 06 — Expediente digital del equipo (Google Drive)

| # | Cambio | Detalle |
|---|---|---|
| 22 | El historial documental (manuales y órdenes de servicio) vivía solo en Drive, desconectado del CMMS | Nueva sección **"Expediente Digital · Historial de Mantenimientos"** en la ficha de cada equipo. El backend localiza en Drive la carpeta del equipo (nombrada "Nombre del equipo + No. de inventario"), clasifica su contenido y lo muestra: manuales, órdenes de servicio por tipo y fecha, y otros documentos |
| 23 | Identificación de órdenes | Los archivos con prefijo **OSMP** (preventivo), **OSMC** (correctivo), **OSI** (instalación) y **OSB** (baja) se reconocen automáticamente; la **fecha** se extrae del nombre en orden año-mes-día con o sin separadores (`OSMP 2026-05-12`, `OSMC_20260311`, `OSI 2026 3 4`). El historial se ordena del más reciente al más antiguo y se puede **filtrar por tipo** |
| 24 | Ver el documento requería permisos de Drive de cada persona | **Visor integrado**: al pulsar "Ver", el backend (que corre con tu cuenta) entrega el documento y se muestra dentro del CMMS (PDF e imágenes; los Google Docs se exportan a PDF). Archivos > 8 MB se abren en Drive. Cada consulta de expediente y de documento queda registrada en la hoja **`Accesos`** |
| 25 | Búsqueda de la carpeta | Coincidencia con frontera numérica: buscar `PAT12` **no** abre la carpeta de `PAT123`. El resultado se cachea 10 min. Opcionalmente define `CARPETA_EQUIPOS_ID` en `Codigo.gs` (ID de la carpeta raíz que contiene todas las carpetas de equipos) para búsquedas más rápidas y sin falsos positivos |

### Configuración de la Rev. 06

1. **Autorizar Google Drive** — La Rev. 06 usa un permiso nuevo (lectura de
   Drive). Tras pegar el `Codigo.gs`, ejecuta `pruebaDrive` desde el editor
   (cambiando el inventario de ejemplo por uno real) y acepta la autorización.
   **Sin este paso, el expediente fallará en la web app.**
2. **Carpeta raíz (recomendado)** — Pega en `CARPETA_EQUIPOS_ID` el ID de la
   carpeta que contiene todas las carpetas de equipos
   (`drive.google.com/drive/folders/[ID]`). Si se deja vacío, se busca en todo tu Drive.
3. **Nueva versión de la implementación** — como siempre. `?action=ping` debe
   responder `"version":"Rev.06"`.

## Integración Rev. 07 — Nomenclatura extendida de órdenes

| # | Cambio | Detalle |
|---|---|---|
| 26 | Las órdenes nombradas "OS-Tipo-fecha" no aparecían en el expediente | Se reconocen ambas nomenclaturas: los **prefijos cortos** (`OSMP`, `OSMC`, `OSI`, `OSB`, `OSA`) y el **formato largo** `OS-Preventivo-04-05-2026-15-15`, `OS-Baja-12-11-2025`, `OS-Instalacion-2025-06-17`, `OS-Correctivo-23-01-2026-12-11`, `OS-Asistencia-12-05-2026-12-50` (con o sin acento en "Instalación") |
| 27 | Formatos de fecha mixtos | La fecha se acepta en **día-mes-año** (convención MX) o **año-mes-día**; la posición del año de 4 dígitos decide el orden. La **hora** final (`-15-15` → 15:15) es opcional y solo se toma si es una hora válida (evita confundirla con otros números del nombre). Dentro del mismo día, las órdenes se ordenan por hora |
| 28 | Nuevo tipo de orden | **Asistencia** (código `OSA`, badge ámbar), con su propio filtro en el expediente |
| 29 | Columna de peso | Eliminada de la tabla del expediente a petición del usuario |

### Convención de nombres esperada en Drive

```
📁 VENTILADOR MECANICO PAT123
   ├── Manual de usuario Dräger.pdf           ← contiene "manual" → sección Manuales
   ├── OSMP 2026-05-12.pdf                    ← preventivo (prefijo corto)
   ├── OS-Preventivo-04-05-2026-15-15.pdf     ← preventivo, 4 may 2026, 15:15
   ├── OS-Correctivo-23-01-2026-12-11.pdf     ← correctivo, 23 ene 2026, 12:11
   ├── OS-Instalacion-2025-06-17.pdf          ← instalación, 17 jun 2025
   ├── OS-Asistencia-12-05-2026-12-50.pdf     ← asistencia, 12 may 2026, 12:50
   ├── OS-Baja-12-11-2025.pdf                 ← baja, 12 nov 2025
   └── Foto de placa.jpg                      ← "Otros documentos"
```



## Integración Rev. 08 — Optimización de velocidad de carga

| # | Cambio | Detalle |
|---|---|---|
| 30 | Al abrir la app había que esperar el `getAll` completo mirando pantalla vacía | **Arranque instantáneo**: los datos de la última sincronización quedan guardados en el navegador y se pintan de inmediato al entrar; el `getAll` corre en segundo plano y los reemplaza al terminar. La etiqueta "(guardado en este equipo)" indica cuándo se está viendo la copia local. La caché se **borra al cerrar sesión** (no deja datos en computadoras compartidas) |
| 31 | Buscar la carpeta del equipo recorría las carpetas de Drive una por una | Con `CARPETA_EQUIPOS_ID` configurada, la búsqueda usa una **consulta filtrada por Google** (`"ID" in parents and title contains ...`): Drive devuelve solo las coincidencias en vez de iterar cientos de carpetas. De varios segundos a <1 s |
| 32 | Volver a abrir la misma ficha repetía toda la consulta a Drive | Doble caché de expedientes: **en el navegador** (durante la sesión, respuesta inmediata) y **en el servidor** (CacheService, 5 min, compartida entre todos los usuarios). El botón **"Actualizar"** salta ambas para traer los documentos recién subidos |
| 33 | Cada lectura escribía una fila en `Accesos` (~0.2–0.4 s por petición) | Nuevo flag `REGISTRAR_LECTURAS` en `Codigo.gs`. Con `true` (por defecto) se registra todo; con `false` solo logins, escrituras e intentos **denegados** — la vigilancia de quién entra se conserva, pero la sincronización es más ágil |

**Nota:** hay una parte del tiempo de carga que no es optimizable desde el código: el "arranque en frío" de Google Apps Script (1–3 s cuando la web app lleva rato sin usarse) y el viaje JSONP. El arranque instantáneo del punto 30 existe precisamente para que ese tiempo ocurra en segundo plano y no se perciba.

## Funciones nuevas

- **Bitácora** (`Bitacora`): folio automático `MP-2026-0001`, técnico responsable, hallazgos, refacciones, tiempo de paro.
- **Tecnovigilancia** (`Tecnovigilancia`): clasificación de evento, paciente involucrado, causa raíz, reporte COFEPRIS — alineado a NOM-240-SSA1-2012.
- **Auditoría** (`Auditoria`): traza de altas y ediciones con usuario y fecha.
- **Indicadores** (`Indicadores`): KPIs mensuales del dashboard (Rev. 05).
- **Accesos** (`Accesos`): bitácora de accesos permitidos y denegados (Rev. 05).

Todas estas hojas se crean solas la primera vez que se usan.

---

## Diagnóstico

Prueba el backend directamente en el navegador:

```
https://TU_URL/exec?action=ping
```

| Resultado | Causa |
|---|---|
| `{"ok":true,...,"version":"Rev.05"}` | Backend correcto y actualizado |
| `{"ok":true,...,"version":"Rev.04"}` | Falta crear **nueva versión** de la implementación |
| Pantalla de login de Google | Acceso ≠ "Cualquier usuario" (paso 5) |
| `Configura SPREADSHEET_ID` | Falta el paso 3 |
| `ACCESO_DENEGADO` en la app | PIN incorrecto o no dado de alta en `CLAVES_ACCESO` (el intento queda en la hoja `Accesos`) |

Si `?action=getAll` devuelve arreglos vacíos, verifica que las hojas se llamen exactamente **Propio**, **Comodato** y **Renta**.

## Frecuencias

`M` mensual · `B` bimestral · `T` trimestral · `C` cuatrimestral · `S` semestral · `A` anual

Formato de `ULTIMO MANTENIMIENTO`: `AAAA-MM` (texto plano recomendado).
