/**
 * =====================================================================
 * CMMS BIOMÉDICO - BACKEND GOOGLE APPS SCRIPT
 * Hospital San Ángel Inn Patriotismo (HSAIP)
 * Ingeniería Biomédica y Tecnovigilancia
 * ---------------------------------------------------------------------
 * Rev. 05 - Cambios de esta revisión:
 *   [NEW-10] Hoja "Indicadores" en el MISMO libro del inventario.
 *            El dashboard ya no depende de un CSV publicado aparte:
 *            los indicadores viajan en el mismo getAll que el inventario.
 *            La hoja se crea sola (con encabezados) la primera vez.
 *   [SEC-11] Control de acceso por PIN + bitácora de accesos ("Accesos").
 *            Cada persona tiene su propio PIN; el servidor resuelve el
 *            nombre a partir del PIN (el cliente no puede suplantarlo).
 *            TODO intento de entrar —correcto o fallido— queda
 *            registrado con fecha, resultado, acción y navegador.
 *   [FIX-12] getLibro() con caché: leerTodo abría el libro 5-6 veces
 *            por petición; ahora se abre una sola vez por ejecución.
 *   [FIX-13] La auditoría de altas/ediciones registra al usuario
 *            AUTENTICADO (resuelto por PIN en el servidor), no un texto
 *            libre enviado por el cliente.
 *
 * Rev. 04 (previas, se conservan):
 *   [FIX-01] Respuesta JSONP para evitar bloqueo CORS desde GitHub Pages
 *   [FIX-02] openById() en lugar de getActiveSpreadsheet()
 *   [FIX-03] Mapeo explícito de encabezados MAYÚSCULAS -> camelCase
 *   [FIX-04] Normalización de fechas a formato yyyy-MM (evita ISO Date)
 *   [FIX-05] LockService para escrituras concurrentes
 *   [FIX-06] Generación de ID único garantizado
 *   [NEW-07] Bitácora de mantenimientos (folio + técnico)
 *   [NEW-08] Registro de tecnovigilancia NOM-240-SSA1-2012
 *   [NEW-09] Núm. de Inventario autogenerado en servidor (PAT/CPAT/RPAT)
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURACIÓN — REEMPLAZA CON EL ID DE TU HOJA DE CÁLCULO
// El ID está en la URL: docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
// ---------------------------------------------------------------------
var SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_HOJA';

// ---------------------------------------------------------------------
// [SEC-11] SEGURIDAD DE ACCESO
// ---------------------------------------------------------------------
// SEGURIDAD_ACTIVA:
//   true  -> toda lectura/escritura exige un PIN válido y se registra.
//   false -> comportamiento abierto de Rev.04 (útil solo para pruebas).
//
// CLAVES_ACCESO: un PIN por persona. La clave es el PIN y el valor es
// el nombre que quedará registrado en Accesos, Auditoria y Bitacora.
// Los PIN viven SOLO aquí (en tu cuenta de Google); el index.html
// publicado en GitHub Pages nunca los contiene.
//
// >> CAMBIA ESTOS PIN ANTES DE DESPLEGAR <<
// ---------------------------------------------------------------------
var SEGURIDAD_ACTIVA = true;

var CLAVES_ACCESO = {
  'CAMBIAME-1234': 'Ing. Omar (Jefe Biomédica)',
  'CAMBIAME-5678': 'Técnico Biomédico 1'
  // Agrega más líneas: 'PIN': 'Nombre visible',
};

var HOJAS_INVENTARIO = ['Propio', 'Comodato', 'Renta'];
var HOJA_BITACORA = 'Bitacora';
var HOJA_TECNOVIGILANCIA = 'Tecnovigilancia';
var HOJA_INDICADORES = 'Indicadores';   // [NEW-10]
var HOJA_ACCESOS = 'Accesos';           // [SEC-11]
var TZ = 'America/Mexico_City';

/**
 * [NEW-09] Prefijo de folio por hoja de inventario. El consecutivo se
 * calcula leyendo la columna NUMERODEINVENTARIO de la propia hoja en el
 * momento del alta (no un contador aparte), así nunca se desincroniza si
 * alguien edita la hoja de cálculo directamente.
 */
var PREFIJOS_INVENTARIO = { 'Propio': 'PAT', 'Comodato': 'CPAT', 'Renta': 'RPAT' };

/**
 * [NEW-10] Columnas de la hoja Indicadores. Son EXACTAMENTE las mismas
 * claves que espera el dashboard del frontend (antes venían del CSV
 * publicado). Una fila por mes; el mes en minúsculas: enero, febrero...
 */
var COLUMNAS_INDICADORES = [
  'mes',
  'mp_cumplimiento', 'mttr',
  'downtime_resonancia', 'downtime_tomografia', 'downtime_hemodinamia', 'downtime_rayos_x',
  'presupuesto_total_asig', 'presupuesto_total_ejer',
  'presupuesto_mtto_asig', 'presupuesto_mtto_ejer',
  'ratio_mp', 'ratio_mc',
  'reto1_titulo', 'reto1_desc', 'reto1_tipo',
  'reto2_titulo', 'reto2_desc', 'reto2_tipo',
  'reto3_titulo', 'reto3_desc', 'reto3_tipo',
  'reto4_titulo', 'reto4_desc', 'reto4_tipo',
  'reto5_titulo', 'reto5_desc', 'reto5_tipo'
];

/**
 * [FIX-03] Mapa explícito de encabezados.
 * La clave es el encabezado normalizado (sin acentos, sin espacios, MAYÚSCULAS).
 * El valor es la propiedad camelCase que espera el frontend.
 */
var MAPA_ENCABEZADOS = {
  'ID': 'id',

  // --- Identificación ---
  'NUMERO': 'numero',
  'NO': 'numero',
  'NUMEROINVENTARIO': 'numeroInventario',
  'NUMERODEINVENTARIO': 'numeroInventario',   // <- tu hoja
  'INVENTARIO': 'numeroInventario',
  'NOMBRE': 'nombre',
  'NOMBREDELEQUIPO': 'nombre',                // <- tu hoja
  'EQUIPO': 'nombre',

  // --- Categoría / tipo de tecnología ---
  'CATEGORIA': 'tipoTecnologia',              // <- tu hoja
  'TIPOTECNOLOGIA': 'tipoTecnologia',
  'TIPODETECNOLOGIA': 'tipoTecnologia',

  // --- Datos técnicos ---
  'MARCA': 'marca',
  'MODELO': 'modelo',
  'NUMEROSERIE': 'numeroSerie',
  'NUMERODESERIE': 'numeroSerie',             // <- tu hoja
  'SERIE': 'numeroSerie',
  'FABRICANTE': 'fabricante',
  'NIVELRIESGO': 'nivelRiesgo',
  'NIVELDERIESGO': 'nivelRiesgo',             // <- tu hoja
  'RIESGO': 'nivelRiesgo',

  // --- Ubicación ---
  'UBICACIONFISICA': 'ubicacion',             // <- tu hoja
  'UBICACION': 'ubicacion',
  'AREA': 'ubicacion',
  'SERVICIO': 'ubicacion',
  'LOCALIZACION': 'ubicacion',

  // --- Administrativos ---
  'FECHAALTA': 'fechaAlta',
  'FECHADEALTA': 'fechaAlta',                 // <- tu hoja
  'PROVEEDORDEMANTENIMIENTO': 'proveedorMantenimiento',  // <- tu hoja
  'PROVEEDORMANTENIMIENTO': 'proveedorMantenimiento',
  'PROVEEDOR': 'proveedorMantenimiento',
  'BREVEDESCRIPCION': 'descripcion',          // <- tu hoja
  'DESCRIPCION': 'descripcion',
  'POLIZAVIGENTE': 'polizaMantenimiento',     // <- tu hoja
  'POLIZAMANTENIMIENTO': 'polizaMantenimiento',
  'POLIZA': 'polizaMantenimiento',

  // --- Estatus ---
  'ESTATUS': 'estatus',
  'ESTADO': 'estatus',
  'MOTIVOFUERADESERVICIO': 'motivoFueraServicio',  // <- tu hoja
  'MOTIVOFUERASERVICIO': 'motivoFueraServicio',
  'MOTIVO': 'motivoFueraServicio',

  // --- Mantenimiento ---
  'FRECUENCIAMANTENIMIENTO': 'frecuenciaMantenimiento',   // <- tu hoja
  'FRECUENCIADEMANTENIMIENTO': 'frecuenciaMantenimiento',
  'FRECUENCIA': 'frecuenciaMantenimiento',
  'ULTIMOMANTENIMIENTO': 'ultimoMantenimiento',           // <- tu hoja
  'ULTIMOMTTO': 'ultimoMantenimiento',
  'PROXIMOMANTENIMIENTO': 'proximoMantenimiento',         // <- tu hoja
  'PROXIMOMTTO': 'proximoMantenimiento',
  'HISTORIALDEEJECUCIONES': 'historialEjecuciones',       // <- tu hoja
  'HISTORIALEJECUCIONES': 'historialEjecuciones',
  'HISTORIAL': 'historialEjecuciones'
};

/** Campos que deben forzarse a formato yyyy-MM. [FIX-04] */
var CAMPOS_MES = ['ultimoMantenimiento', 'proximoMantenimiento'];
/** Campos que deben forzarse a formato yyyy-MM-dd. [FIX-04] */
var CAMPOS_FECHA = ['fechaAlta'];

// =====================================================================
// [SEC-11] CONTROL DE ACCESO
// =====================================================================

/**
 * Devuelve el nombre asociado al PIN, o null si no es válido.
 * El nombre resuelto aquí es el que se usa en Accesos/Auditoria/Bitacora:
 * el cliente NO puede declarar un nombre distinto al de su PIN.
 */
function validarPin(pin) {
  if (!SEGURIDAD_ACTIVA) return 'Acceso libre (seguridad desactivada)';
  if (!pin) return null;
  var usuario = CLAVES_ACCESO[String(pin).trim()];
  return usuario || null;
}

/** Enmascara el PIN para el registro: nunca guardamos intentos completos. */
function enmascararPin(pin) {
  var s = String(pin || '').trim();
  if (!s) return '(vacío)';
  return s.charAt(0) + '···' + ' (' + s.length + ' caracteres)';
}

/**
 * Registra CADA intento de acceso en la hoja "Accesos".
 * resultado: PERMITIDO | DENEGADO
 * evento:    LOGIN | LECTURA | ESCRITURA | PING
 * La hoja se crea sola la primera vez.
 *
 * Nota honesta sobre alcance: Apps Script no expone la IP del visitante
 * ni su cuenta de Google cuando la app se ejecuta como "Yo" con acceso
 * "Cualquier usuario". Lo que sí queda registrado: fecha/hora exacta,
 * si el PIN fue válido y de quién era, qué acción intentó, el navegador
 * (user agent que reporta el cliente) y el PIN enmascarado en fallos.
 */
function registrarAcceso(evento, resultado, usuario, accion, detalle, ua) {
  try {
    var libro = getLibro();
    var log = libro.getSheetByName(HOJA_ACCESOS);
    if (!log) {
      log = libro.insertSheet(HOJA_ACCESOS);
      log.appendRow(['FECHA', 'RESULTADO', 'EVENTO', 'USUARIO', 'ACCION', 'DETALLE', 'NAVEGADOR']);
      log.getRange(1, 1, 1, 7).setFontWeight('bold')
         .setBackground('#7A1F1F').setFontColor('#FFFFFF');
      log.setFrozenRows(1);
    }
    log.appendRow([
      ahora(), resultado, evento,
      usuario || '(desconocido)',
      accion || '', detalle || '',
      String(ua || '').substring(0, 180)
    ]);
  } catch (err) {
    // El registro de accesos nunca debe tirar la operación principal
  }
}

// =====================================================================
// ENTRADA HTTP
// =====================================================================

function doGet(e) {
  if (!e || !e.parameter) {
    return textOut('Backend CMMS activo. Rev.05. Debe invocarse desde la aplicación.');
  }

  var action = e.parameter.action;
  var callback = e.parameter.callback; // [FIX-01] JSONP
  var pin = e.parameter.pin || '';
  var ua = e.parameter.ua || '';

  try {
    var payload;

    // --- Acciones abiertas (no exponen datos) --------------------------
    if (action === 'ping') {
      return responder({ ok: true, hora: ahora(), version: 'Rev.05', seguridad: SEGURIDAD_ACTIVA }, callback);
    }

    if (action === 'login') {
      var quien = validarPin(pin);
      if (quien) {
        registrarAcceso('LOGIN', 'PERMITIDO', quien, 'login', '', ua);
        return responder({ ok: true, usuario: quien, hora: ahora() }, callback);
      }
      registrarAcceso('LOGIN', 'DENEGADO', '(PIN no reconocido)', 'login',
        'PIN intentado: ' + enmascararPin(pin), ua);
      return responder({ error: 'ACCESO_DENEGADO: PIN incorrecto.' }, callback);
    }

    // --- Todo lo demás exige sesión válida -----------------------------
    var usuario = validarPin(pin);
    if (SEGURIDAD_ACTIVA && !usuario) {
      registrarAcceso('DATOS', 'DENEGADO', '(sin PIN válido)', action,
        'PIN intentado: ' + enmascararPin(pin), ua);
      return responder({ error: 'ACCESO_DENEGADO: sesión inválida. Vuelve a iniciar sesión.' }, callback);
    }

    if (action === 'getAll') {
      payload = leerTodo();
      registrarAcceso('LECTURA', 'PERMITIDO', usuario, action, '', ua);
    } else if (action === 'getBitacora') {
      payload = { bitacora: leerHoja(HOJA_BITACORA) };
      registrarAcceso('LECTURA', 'PERMITIDO', usuario, action, '', ua);
    } else if (action === 'getTecnovigilancia') {
      payload = { tecnovigilancia: leerHoja(HOJA_TECNOVIGILANCIA) };
      registrarAcceso('LECTURA', 'PERMITIDO', usuario, action, '', ua);
    } else if (action === 'getIndicadores') {
      payload = { indicadores: leerHojaIndicadores() };
      registrarAcceso('LECTURA', 'PERMITIDO', usuario, action, '', ua);
    } else if (action === 'save') {
      // [FIX-01] Escritura vía GET+JSONP: evita el preflight CORS del POST
      var params = JSON.parse(e.parameter.payload);
      params._usuario = usuario; // [FIX-13] identidad resuelta en servidor
      payload = procesarEscritura(params);
      registrarAcceso('ESCRITURA', payload && payload.error ? 'DENEGADO' : 'PERMITIDO',
        usuario, params.action || 'save',
        (params.sheetName || '') + ' ' + ((params.data && params.data.numeroInventario) || ''), ua);
    } else {
      payload = { error: 'Acción no válida: ' + action };
    }

    return responder(payload, callback);

  } catch (err) {
    return responder({ error: err.toString(), stack: err.stack || '' }, callback);
  }
}

function doPost(e) {
  if (!e || !e.postData) return responder({ error: 'Sin datos' }, null);
  try {
    var params = JSON.parse(e.postData.contents);
    var usuario = validarPin(params.pin);
    if (SEGURIDAD_ACTIVA && !usuario) {
      registrarAcceso('DATOS', 'DENEGADO', '(sin PIN válido)', params.action || 'post',
        'PIN intentado: ' + enmascararPin(params.pin), '');
      return responder({ error: 'ACCESO_DENEGADO: sesión inválida.' }, null);
    }
    params._usuario = usuario;
    return responder(procesarEscritura(params), null);
  } catch (err) {
    return responder({ error: err.toString() }, null);
  }
}

/**
 * [FIX-01] Responde JSONP si viene callback, JSON puro si no.
 * ContentService NO permite encabezados CORS, por lo que JSONP
 * es la única vía confiable desde un dominio externo (GitHub Pages).
 */
function responder(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    // Sanitiza el nombre del callback: solo identificador JS válido.
    var cb = String(callback).replace(/[^A-Za-z0-9_$.]/g, '');
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function textOut(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}

// =====================================================================
// LECTURA
// =====================================================================

/**
 * [FIX-02] Acceso confiable al libro, sin depender del contexto activo.
 * [FIX-12] Con caché por ejecución: getAll leía el libro 5-6 veces.
 */
var __libroCache = null;

function getLibro() {
  if (__libroCache) return __libroCache;
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('PEGA_AQUI') === 0) {
    throw new Error('Configura SPREADSHEET_ID en la sección de configuración del script.');
  }
  __libroCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  return __libroCache;
}

function leerTodo() {
  var resultado = { historial: [] };
  HOJAS_INVENTARIO.forEach(function (nombre) {
    resultado[nombre.toLowerCase()] = leerHoja(nombre);
  });
  resultado.bitacora = leerHoja(HOJA_BITACORA);
  resultado.tecnovigilancia = leerHoja(HOJA_TECNOVIGILANCIA);
  resultado.indicadores = leerHojaIndicadores();   // [NEW-10]
  resultado.sincronizado = ahora();
  return resultado;
}

function leerHoja(nombreHoja) {
  var libro = getLibro();
  var hoja = libro.getSheetByName(nombreHoja);
  if (!hoja) return [];

  var rango = hoja.getDataRange().getValues();
  if (rango.length <= 1) return [];

  var encabezados = rango[0].map(mapearEncabezado);
  var filas = [];

  for (var i = 1; i < rango.length; i++) {
    var obj = {};
    var vacia = true;

    for (var j = 0; j < encabezados.length; j++) {
      var clave = encabezados[j];
      if (!clave) continue;
      var valor = normalizarValor(clave, rango[i][j]);
      obj[clave] = valor;
      if (valor !== '' && valor !== null) vacia = false;
    }

    if (vacia) continue;

    // [FIX-06] Garantiza un ID estable aunque la hoja no traiga columna ID
    if (!obj.id) {
      obj.id = obj.numeroInventario
        ? 'INV-' + obj.numeroInventario
        : 'ROW-' + (i + 1);
    }
    obj._fila = i + 1; // fila real en la hoja, acelera la edición
    filas.push(obj);
  }
  return filas;
}

/**
 * [NEW-10] Lee la hoja Indicadores conservando los encabezados TAL CUAL
 * (en minúsculas), porque el dashboard espera claves con guion bajo
 * (mp_cumplimiento, downtime_rayos_x, reto1_titulo...) que el mapa de
 * inventario destruiría. Si la hoja no existe, se crea con todas las
 * columnas listas para capturar y se devuelve vacía.
 */
function leerHojaIndicadores() {
  var libro = getLibro();
  var hoja = libro.getSheetByName(HOJA_INDICADORES);
  if (!hoja) {
    try { crearHojaIndicadores(); } catch (e) { /* creada en paralelo */ }
    return [];
  }

  var rango = hoja.getDataRange().getValues();
  if (rango.length <= 1) return [];

  var encabezados = rango[0].map(function (h) {
    return String(h || '').trim().toLowerCase();
  });

  var filas = [];
  for (var i = 1; i < rango.length; i++) {
    var obj = {};
    var vacia = true;
    for (var j = 0; j < encabezados.length; j++) {
      var k = encabezados[j];
      if (!k) continue;
      var v = rango[i][j];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      }
      obj[k] = v;
      if (v !== '' && v !== null) vacia = false;
    }
    if (!vacia) filas.push(obj);
  }
  return filas;
}

function crearHojaIndicadores() {
  var hoja = getLibro().insertSheet(HOJA_INDICADORES);
  hoja.appendRow(COLUMNAS_INDICADORES);
  hoja.getRange(1, 1, 1, COLUMNAS_INDICADORES.length)
      .setFontWeight('bold').setBackground('#1F4687').setFontColor('#FFFFFF');
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(1);
  return hoja;
}

/** [FIX-03] Normaliza y traduce el encabezado usando el mapa explícito. */
function mapearEncabezado(h) {
  if (h === null || h === undefined || h === '') return '';
  var limpio = String(h)
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^A-Za-z0-9]/g, '')                      // quita espacios y signos
    .toUpperCase();

  if (MAPA_ENCABEZADOS[limpio]) return MAPA_ENCABEZADOS[limpio];

  // Fallback correcto: TODO EN MAYÚSCULAS -> minúsculas completas
  return limpio.toLowerCase();
}

/**
 * [FIX-04] Convierte objetos Date de Sheets al string que espera el frontend.
 */
function normalizarValor(clave, valor) {
  if (valor === null || valor === undefined) return '';

  if (Object.prototype.toString.call(valor) === '[object Date]') {
    if (CAMPOS_MES.indexOf(clave) > -1) {
      return Utilities.formatDate(valor, TZ, 'yyyy-MM');
    }
    return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  }

  var str = String(valor).trim();

  // Un texto de fecha completa en un campo de mes se recorta a yyyy-MM
  if (CAMPOS_MES.indexOf(clave) > -1 && /^\d{4}-\d{2}/.test(str)) {
    return str.substring(0, 7);
  }
  if (CAMPOS_FECHA.indexOf(clave) > -1 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  return str;
}

// =====================================================================
// ESCRITURA
// =====================================================================

/** [FIX-05] Toda escritura pasa por aquí, serializada con LockService. */
function procesarEscritura(params) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { error: 'Sistema ocupado, intenta de nuevo en unos segundos.' };
  }

  try {
    var action = params.action;

    if (action === 'add')            return accionAgregar(params);
    if (action === 'edit')           return accionEditar(params);
    if (action === 'bitacora')       return accionBitacora(params);
    if (action === 'tecnovigilancia')return accionTecnovigilancia(params);

    return { error: 'Acción de escritura no válida: ' + action };
  } finally {
    lock.releaseLock();
  }
}

/**
 * [NEW-09] Calcula el siguiente folio (PAT/CPAT/RPAT + consecutivo) leyendo
 * el máximo actual en la propia hoja, dentro del LockService.
 */
function generarSiguienteNumeroInventario(hoja, sheetName) {
  var prefijo = PREFIJOS_INVENTARIO[sheetName] || '';
  var registros = hoja.getDataRange().getValues();
  var maximo = 0;

  if (registros.length > 1) {
    var encabezados = registros[0].map(mapearEncabezado);
    var invIdx = encabezados.indexOf('numeroInventario');
    if (invIdx > -1) {
      for (var i = 1; i < registros.length; i++) {
        var m = String(registros[i][invIdx] || '').match(/(\d+)\s*$/);
        if (m) {
          var n = parseInt(m[1], 10);
          if (!isNaN(n) && n > maximo) maximo = n;
        }
      }
    }
  }

  var siguiente = maximo + 1;
  return { numero: siguiente, folio: prefijo + siguiente };
}

function accionAgregar(params) {
  var hoja = getHoja(params.sheetName);
  if (!hoja) return { error: 'Hoja no encontrada: ' + params.sheetName };

  var data = params.data || {};

  // [NEW-09] El folio SIEMPRE lo asigna el servidor.
  var auto = generarSiguienteNumeroInventario(hoja, params.sheetName);
  data.numeroInventario = auto.folio;
  data.numero = auto.numero;
  data.id = 'INV-' + auto.folio;

  var encabezados = getEncabezados(hoja);
  var fila = encabezados.map(function (clave) {
    return data[clave] !== undefined ? data[clave] : '';
  });

  hoja.appendRow(fila);
  // [FIX-13] Usuario autenticado (resuelto por PIN), no texto del cliente
  registrarAuditoria('ALTA', params.sheetName, data.numeroInventario, params._usuario || data.usuario);

  return { success: true, message: 'Equipo dado de alta', id: data.id, numeroInventario: auto.folio };
}

function accionEditar(params) {
  var hoja = getHoja(params.sheetName);
  if (!hoja) return { error: 'Hoja no encontrada: ' + params.sheetName };

  var data = params.data || {};
  var registros = hoja.getDataRange().getValues();
  var encabezados = registros[0].map(mapearEncabezado);

  var idIdx = encabezados.indexOf('id');
  var invIdx = encabezados.indexOf('numeroInventario');
  var buscarInv = params.originalInventario || data.numeroInventario;

  var filaDestino = -1;

  // Prioridad 1: coincidencia exacta por ID (solo si el ID es real)
  if (idIdx > -1 && data.id && String(data.id).indexOf('ROW-') !== 0) {
    for (var i = 1; i < registros.length; i++) {
      if (String(registros[i][idIdx]).trim() === String(data.id).trim()) {
        filaDestino = i + 1; break;
      }
    }
  }
  // Prioridad 2: número de inventario
  if (filaDestino === -1 && invIdx > -1 && buscarInv) {
    for (var k = 1; k < registros.length; k++) {
      if (String(registros[k][invIdx]).trim() === String(buscarInv).trim()) {
        filaDestino = k + 1; break;
      }
    }
  }
  // Prioridad 3: número de fila enviado por el cliente
  if (filaDestino === -1 && params.fila && params.fila > 1) {
    filaDestino = params.fila;
  }

  if (filaDestino === -1) return { error: 'Registro no encontrado. No se modificó nada.' };

  var original = registros[filaDestino - 1];
  var nuevaFila = encabezados.map(function (clave, idx) {
    if (!clave) return original[idx];
    return data[clave] !== undefined ? data[clave] : original[idx];
  });

  hoja.getRange(filaDestino, 1, 1, nuevaFila.length).setValues([nuevaFila]);
  registrarAuditoria('EDICION', params.sheetName, data.numeroInventario, params._usuario || data.usuario);

  return { success: true, message: 'Registro actualizado', fila: filaDestino };
}

// =====================================================================
// [NEW-07] BITÁCORA DE MANTENIMIENTOS — folio y técnico responsable
// =====================================================================

function accionBitacora(params) {
  var hoja = getHoja(HOJA_BITACORA) || crearHojaBitacora();
  var d = params.data || {};

  var folio = generarFolio(d.tipo === 'MC' ? 'MC' : 'MP');
  var fila = [
    folio,
    ahora(),
    d.numeroInventario || '',
    d.nombreEquipo || '',
    d.origen || '',
    d.ubicacion || '',
    d.tipo || 'MP',
    d.periodo || '',
    d.tecnico || params._usuario || '',
    d.hallazgos || '',
    d.acciones || '',
    d.refacciones || '',
    d.tiempoParoHrs || '',
    d.estatusFinal || 'Concluido',
    d.proveedor || ''
  ];

  hoja.appendRow(fila);
  return { success: true, message: 'Bitácora registrada', folio: folio };
}

function crearHojaBitacora() {
  var hoja = getLibro().insertSheet(HOJA_BITACORA);
  hoja.appendRow([
    'FOLIO', 'FECHA REGISTRO', 'NUMERO INVENTARIO', 'NOMBRE EQUIPO', 'ORIGEN',
    'UBICACION', 'TIPO', 'PERIODO', 'TECNICO RESPONSABLE', 'HALLAZGOS',
    'ACCIONES REALIZADAS', 'REFACCIONES', 'TIEMPO PARO HRS', 'ESTATUS FINAL', 'PROVEEDOR'
  ]);
  hoja.getRange(1, 1, 1, 15).setFontWeight('bold')
      .setBackground('#1F4687').setFontColor('#FFFFFF');
  hoja.setFrozenRows(1);
  return hoja;
}

/** Folio consecutivo tipo MP-2026-0001, persistido en PropertiesService. */
function generarFolio(prefijo) {
  var props = PropertiesService.getScriptProperties();
  var anio = Utilities.formatDate(new Date(), TZ, 'yyyy');
  var clave = 'FOLIO_' + prefijo + '_' + anio;
  var consecutivo = parseInt(props.getProperty(clave) || '0', 10) + 1;
  props.setProperty(clave, String(consecutivo));
  return prefijo + '-' + anio + '-' + ('0000' + consecutivo).slice(-4);
}

// =====================================================================
// [NEW-08] TECNOVIGILANCIA — NOM-240-SSA1-2012
// =====================================================================

function accionTecnovigilancia(params) {
  var hoja = getHoja(HOJA_TECNOVIGILANCIA) || crearHojaTecnovigilancia();
  var d = params.data || {};

  var folio = generarFolio('TV');
  var fila = [
    folio,
    ahora(),
    d.fechaEvento || '',
    d.numeroInventario || '',
    d.nombreEquipo || '',
    d.marca || '',
    d.modelo || '',
    d.numeroSerie || '',
    d.ubicacion || '',
    d.clasificacion || '',        // Incidente / Evento adverso / Casi incidente
    d.pacienteInvolucrado || 'No',
    d.desenlace || '',
    d.descripcion || '',
    d.accionInmediata || '',
    d.causaRaiz || '',
    d.accionCorrectiva || '',
    d.reportadoCofepris || 'No',
    d.fechaReporteCofepris || '',
    d.responsable || params._usuario || '',
    d.estatus || 'Abierto'
  ];

  hoja.appendRow(fila);
  return { success: true, message: 'Evento de tecnovigilancia registrado', folio: folio };
}

function crearHojaTecnovigilancia() {
  var hoja = getLibro().insertSheet(HOJA_TECNOVIGILANCIA);
  hoja.appendRow([
    'FOLIO', 'FECHA REGISTRO', 'FECHA EVENTO', 'NUMERO INVENTARIO', 'NOMBRE EQUIPO',
    'MARCA', 'MODELO', 'NUMERO SERIE', 'UBICACION', 'CLASIFICACION',
    'PACIENTE INVOLUCRADO', 'DESENLACE', 'DESCRIPCION', 'ACCION INMEDIATA',
    'CAUSA RAIZ', 'ACCION CORRECTIVA', 'REPORTADO COFEPRIS', 'FECHA REPORTE COFEPRIS',
    'RESPONSABLE', 'ESTATUS'
  ]);
  hoja.getRange(1, 1, 1, 20).setFontWeight('bold')
      .setBackground('#1F4687').setFontColor('#FFFFFF');
  hoja.setFrozenRows(1);
  return hoja;
}

// =====================================================================
// AUDITORÍA Y UTILIDADES
// =====================================================================

/** Traza de cambios para soporte a auditorías de COFEPRIS / calidad. */
function registrarAuditoria(evento, hoja, inventario, usuario) {
  try {
    var libro = getLibro();
    var log = libro.getSheetByName('Auditoria');
    if (!log) {
      log = libro.insertSheet('Auditoria');
      log.appendRow(['FECHA', 'EVENTO', 'HOJA', 'NUMERO INVENTARIO', 'USUARIO']);
      log.getRange(1, 1, 1, 5).setFontWeight('bold')
         .setBackground('#1F4687').setFontColor('#FFFFFF');
      log.setFrozenRows(1);
    }
    log.appendRow([ahora(), evento, hoja, inventario || '', usuario || 'sistema']);
  } catch (err) {
    // La auditoría nunca debe bloquear la operación principal
  }
}

function getHoja(nombre) {
  return getLibro().getSheetByName(nombre);
}

function getEncabezados(hoja) {
  var ultima = hoja.getLastColumn();
  if (ultima < 1) return [];
  return hoja.getRange(1, 1, 1, ultima).getValues()[0].map(mapearEncabezado);
}

function ahora() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

// =====================================================================
// PRUEBAS — ejecuta estas funciones desde el editor para validar
// =====================================================================

function pruebaConexion() {
  try {
    var libro = getLibro();
    Logger.log('Libro: ' + libro.getName());
    HOJAS_INVENTARIO.forEach(function (n) {
      var h = libro.getSheetByName(n);
      Logger.log(n + ': ' + (h ? h.getLastRow() - 1 + ' registros' : 'NO EXISTE'));
      if (h) Logger.log('  Encabezados -> ' + getEncabezados(h).join(', '));
    });
    var ind = libro.getSheetByName(HOJA_INDICADORES);
    Logger.log('Indicadores: ' + (ind ? (ind.getLastRow() - 1) + ' meses capturados' : 'NO EXISTE (se creará sola)'));
    Logger.log('Seguridad activa: ' + SEGURIDAD_ACTIVA + ' | PINs configurados: ' + Object.keys(CLAVES_ACCESO).length);
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
  }
}

/** Crea manualmente la hoja Indicadores (opcional; también se crea sola). */
function inicializarIndicadores() {
  var libro = getLibro();
  if (libro.getSheetByName(HOJA_INDICADORES)) {
    Logger.log('La hoja Indicadores ya existe.');
    return;
  }
  crearHojaIndicadores();
  Logger.log('Hoja Indicadores creada con ' + COLUMNAS_INDICADORES.length + ' columnas.');
}

/**
 * DIAGNÓSTICO: muestra cada encabezado real y su traducción.
 */
function verEncabezados() {
  var CAMPOS_OK = ['id','numero','numeroInventario','nombre','marca','modelo',
    'numeroSerie','fabricante','nivelRiesgo','ubicacion','fechaAlta',
    'proveedorMantenimiento','descripcion','estatus','motivoFueraServicio',
    'polizaMantenimiento','frecuenciaMantenimiento','ultimoMantenimiento',
    'proximoMantenimiento','historialEjecuciones','tipoTecnologia'];

  var libro = getLibro();
  Logger.log('LIBRO: ' + libro.getName());

  HOJAS_INVENTARIO.forEach(function (n) {
    var h = libro.getSheetByName(n);
    if (!h) { Logger.log('===== ' + n + ' : NO EXISTE ====='); return; }

    Logger.log('===== ' + n + ' (' + (h.getLastRow() - 1) + ' registros) =====');
    var crudos = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];

    crudos.forEach(function (c, i) {
      var m = mapearEncabezado(c);
      var estado = CAMPOS_OK.indexOf(m) > -1 ? 'OK' : '*** NO RECONOCIDO ***';
      Logger.log((i + 1) + '. "' + c + '" -> ' + m + '  ' + estado);
    });
  });
}
