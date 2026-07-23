/**
 * =====================================================================
 * CMMS BIOMÉDICO - BACKEND GOOGLE APPS SCRIPT
 * Hospital San Ángel Inn Patriotismo (HSAIP)
 * Ingeniería Biomédica y Tecnovigilancia
 * ---------------------------------------------------------------------
 * Rev. 02 - Correcciones críticas:
 *   [FIX-01] Respuesta JSONP para evitar bloqueo CORS desde GitHub Pages
 *   [FIX-02] openById() en lugar de getActiveSpreadsheet()
 *   [FIX-03] Mapeo explícito de encabezados MAYÚSCULAS -> camelCase
 *   [FIX-04] Normalización de fechas a formato yyyy-MM (evita ISO Date)
 *   [FIX-05] LockService para escrituras concurrentes
 *   [FIX-06] Generación de ID único garantizado
 *   [NEW-07] Bitácora de mantenimientos (folio + técnico)
 *   [NEW-08] Registro de tecnovigilancia NOM-240-SSA1-2012
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURACIÓN — REEMPLAZA CON EL ID DE TU HOJA DE CÁLCULO
// El ID está en la URL: docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
// ---------------------------------------------------------------------
var SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_HOJA';

var HOJAS_INVENTARIO = ['Propio', 'Comodato', 'Renta'];
var HOJA_BITACORA = 'Bitacora';
var HOJA_TECNOVIGILANCIA = 'Tecnovigilancia';
var TZ = 'America/Mexico_City';

/**
 * [FIX-03] Mapa explícito de encabezados.
 * La clave es el encabezado normalizado (sin acentos, sin espacios, MAYÚSCULAS).
 * El valor es la propiedad camelCase que espera el frontend.
 *
 * Esto elimina la ambigüedad del regex anterior, que convertía
 * "ÚLTIMO MANTENIMIENTO" en "uLTIMOMANTENIMIENTO" en vez de "ultimoMantenimiento".
 */
var MAPA_ENCABEZADOS = {
  'ID': 'id',
  'NUMERO': 'numero',
  'NO': 'numero',
  'NUMEROINVENTARIO': 'numeroInventario',
  'NUMERODEINVENTARIO': 'numeroInventario',
  'INVENTARIO': 'numeroInventario',
  'ESTATUS': 'estatus',
  'ESTADO': 'estatus',
  'MOTIVOFUERASERVICIO': 'motivoFueraServicio',
  'MOTIVOFUERADESERVICIO': 'motivoFueraServicio',
  'MOTIVO': 'motivoFueraServicio',
  'NOMBRE': 'nombre',
  'NOMBREDELEQUIPO': 'nombre',
  'EQUIPO': 'nombre',
  'MARCA': 'marca',
  'POLIZAMANTENIMIENTO': 'polizaMantenimiento',
  'POLIZA': 'polizaMantenimiento',
  'MODELO': 'modelo',
  'NUMEROSERIE': 'numeroSerie',
  'NUMERODESERIE': 'numeroSerie',
  'SERIE': 'numeroSerie',
  'FABRICANTE': 'fabricante',
  'NIVELRIESGO': 'nivelRiesgo',
  'NIVELDERIESGO': 'nivelRiesgo',
  'RIESGO': 'nivelRiesgo',
  'UBICACION': 'ubicacion',
  'AREA': 'ubicacion',
  'SERVICIO': 'ubicacion',
  'FECHAALTA': 'fechaAlta',
  'FECHADEALTA': 'fechaAlta',
  'PROVEEDORMANTENIMIENTO': 'proveedorMantenimiento',
  'PROVEEDOR': 'proveedorMantenimiento',
  'DESCRIPCION': 'descripcion',
  'TIPOTECNOLOGIA': 'tipoTecnologia',
  'TIPODETECNOLOGIA': 'tipoTecnologia',
  'FRECUENCIAMANTENIMIENTO': 'frecuenciaMantenimiento',
  'FRECUENCIADEMANTENIMIENTO': 'frecuenciaMantenimiento',
  'FRECUENCIA': 'frecuenciaMantenimiento',
  'ULTIMOMANTENIMIENTO': 'ultimoMantenimiento',
  'ULTIMOMTTO': 'ultimoMantenimiento',
  'PROXIMOMANTENIMIENTO': 'proximoMantenimiento',
  'PROXIMOMTTO': 'proximoMantenimiento',
  'HISTORIALEJECUCIONES': 'historialEjecuciones',
  'HISTORIAL': 'historialEjecuciones'
};

/** Campos que deben forzarse a formato yyyy-MM. [FIX-04] */
var CAMPOS_MES = ['ultimoMantenimiento', 'proximoMantenimiento'];
/** Campos que deben forzarse a formato yyyy-MM-dd. [FIX-04] */
var CAMPOS_FECHA = ['fechaAlta'];

// =====================================================================
// ENTRADA HTTP
// =====================================================================

function doGet(e) {
  if (!e || !e.parameter) {
    return textOut('Backend CMMS activo. Rev.02. Debe invocarse desde la aplicación.');
  }

  var action = e.parameter.action;
  var callback = e.parameter.callback; // [FIX-01] JSONP

  try {
    var payload;

    if (action === 'getAll') {
      payload = leerTodo();
    } else if (action === 'getBitacora') {
      payload = { bitacora: leerHoja(HOJA_BITACORA) };
    } else if (action === 'getTecnovigilancia') {
      payload = { tecnovigilancia: leerHoja(HOJA_TECNOVIGILANCIA) };
    } else if (action === 'save') {
      // [FIX-01] Escritura vía GET+JSONP: evita el preflight CORS del POST
      payload = procesarEscritura(JSON.parse(e.parameter.payload));
    } else if (action === 'ping') {
      payload = { ok: true, hora: ahora(), version: 'Rev.02' };
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
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
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

/** [FIX-02] Acceso confiable al libro, sin depender del contexto activo. */
function getLibro() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('PEGA_AQUI') === 0) {
    throw new Error('Configura SPREADSHEET_ID en la línea 27 del script.');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function leerTodo() {
  var resultado = { historial: [] };
  HOJAS_INVENTARIO.forEach(function (nombre) {
    resultado[nombre.toLowerCase()] = leerHoja(nombre);
  });
  resultado.bitacora = leerHoja(HOJA_BITACORA);
  resultado.tecnovigilancia = leerHoja(HOJA_TECNOVIGILANCIA);
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
 * Sin esto, "2026-03" llega como "2026-03-15T06:00:00.000Z" y el
 * split('-') del calendario produce un mes inválido (15).
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

function accionAgregar(params) {
  var hoja = getHoja(params.sheetName);
  if (!hoja) return { error: 'Hoja no encontrada: ' + params.sheetName };

  var data = params.data || {};
  if (!data.id) data.id = 'INV-' + new Date().getTime();

  var encabezados = getEncabezados(hoja);
  var fila = encabezados.map(function (clave) {
    return data[clave] !== undefined ? data[clave] : '';
  });

  hoja.appendRow(fila);
  registrarAuditoria('ALTA', params.sheetName, data.numeroInventario, data.usuario);

  return { success: true, message: 'Equipo dado de alta', id: data.id };
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
  registrarAuditoria('EDICION', params.sheetName, data.numeroInventario, data.usuario);

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
    d.tecnico || '',
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
    d.responsable || '',
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
// PRUEBAS — ejecuta esta función desde el editor para validar la conexión
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
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
  }
}
