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

## Funciones nuevas

- **Bitácora** (`Bitacora`): folio automático `MP-2026-0001`, técnico responsable, hallazgos, refacciones, tiempo de paro.
- **Tecnovigilancia** (`Tecnovigilancia`): clasificación de evento, paciente involucrado, causa raíz, reporte COFEPRIS — alineado a NOM-240-SSA1-2012.
- **Auditoría** (`Auditoria`): traza de altas y ediciones con usuario y fecha.

Las tres hojas se crean solas la primera vez que se usan.

---

## Diagnóstico

Prueba el backend directamente en el navegador:

```
https://TU_URL/exec?action=ping
```

| Resultado | Causa |
|---|---|
| `{"ok":true,...}` | Backend correcto |
| Pantalla de login de Google | Acceso ≠ "Cualquier usuario" (paso 5) |
| `Configura SPREADSHEET_ID` | Falta el paso 3 |

Si `?action=getAll` devuelve arreglos vacíos, verifica que las hojas se llamen exactamente **Propio**, **Comodato** y **Renta**.

## Frecuencias

`M` mensual · `B` bimestral · `T` trimestral · `C` cuatrimestral · `S` semestral · `A` anual

Formato de `ULTIMO MANTENIMIENTO`: `AAAA-MM` (texto plano recomendado).
