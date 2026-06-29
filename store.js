/* ============================================================================
   AIPROTECH · Caché de datos local del WebView (clave cp_data_v6).
   - Espejo offline de lo que cp-supabase.js sincroniza con Supabase (datos REALES).
   - Lo usan los módulos: repartidor, planta, portal, dashboard.
   - Sin datos demo: arranca vacío y se llena con la operación real.
   ========================================================================== */
(function (global) {
  var KEY = 'cp_data_v6';

  // Precio unitario de REFERENCIA para estimar el monto de una nota cuando el chofer
  // NO ingresa el precio real (se marca montoEstimado=true para no confundirlo con dato real).
  var PRECIO_UNIT_REF = 4500;

  function now() { return new Date().getTime(); }
  function uid(p) { return (p || 'id') + '_' + now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function clp(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL'); }

  var TIPO_NOTA = {
    MAL_ESTADO: 'CREDITO', FALTANTE: 'CREDITO', DESPACHO_INCOMPLETO: 'CREDITO',
    RECHAZO_CLIENTE: 'CREDITO', DEVOLUCION: 'CREDITO', SOBRANTE: 'COBRO'
  };


  function load() {
    try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  // ── Aislamiento por usuario ───────────────────────────────────────────────
  // Si en este dispositivo inicia sesión un usuario DISTINTO al dueño del caché local,
  // se limpia el cuadre (cp_data_v6) → ningún chofer ve los comprobantes/documentos de otro.
  try {
    var _perfil = JSON.parse(localStorage.getItem('cp_perfil') || '{}');
    var _cur = (_perfil && _perfil.usuario) ? String(_perfil.usuario) : '';
    if (_cur) {
      var _owner = localStorage.getItem('cp_data_owner') || '';
      if (_owner && _owner !== _cur) { try { localStorage.removeItem(KEY); } catch (e) {} }
      localStorage.setItem('cp_data_owner', _cur);
    }
  } catch (e) {}

  var data = load();
  if (!data) { data = {}; persist(); }   // arranque limpio (sin datos demo)
  ensureData();
  // Asegura colecciones, coordenadas e histórico (al cargar y tras reset)
  function ensureData() {
    ['repartidores', 'entregas', 'documentos', 'incidencias', 'facturas', 'pagos', 'disputas', 'alertas', 'vehiculos', 'banco', 'libro', 'notas', 'cierre', 'audit', 'historico', 'reglas', 'intercompany'].forEach(function (k) { if (!data[k]) data[k] = []; });
    var chg = false;
    if (chg) persist();
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    emit();
  }
  function emit() {
    try { global.dispatchEvent(new Event('cp-change')); } catch (e) {}
  }

  // ── API pública ──────────────────────────────────────────────────────────
  var CP = {
    KEY: KEY,
    clp: clp,
    TIPO_NOTA: TIPO_NOTA,

    all: function () { return data; },
    reset: function () { data = {}; ensureData(); persist(); return data; },

    // ── Entregas (repartidor) ──
    entregas: function () { var c = (data.repartidor ? data.repartidor.id : 'r1'); return data.entregas.filter(function (e) { return (e.repartidorId || 'r1') === c; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); },
    entregasDe: function (rid) { return data.entregas.filter(function (e) { return (e.repartidorId || 'r1') === rid; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); },
    addEntrega: function (e) {
      var n = { id: uid('e'), repartidorId: e.repartidorId || (data.repartidor ? data.repartidor.id : 'r1'), cliente: e.cliente || 'Cliente', direccion: e.direccion || '', monto: Number(e.monto) || 0, kilos: Number(e.kilos) || 0, volumen: Number(e.volumen) || 0, guia: e.guia || '', factura: e.factura || '', lat: (e.lat != null ? e.lat : -33.45 + (Math.random() - 0.5) * 0.18), lng: (e.lng != null ? e.lng : -70.66 + (Math.random() - 0.5) * 0.22), estado: 'pendiente', ts: now() };
      data.entregas.push(n); persist(); return n;
    },
    firmarEntrega: function (id, firmaTipo, firmaData, receptor, factura) {
      var c = (data.repartidor ? data.repartidor.id : 'r1');
      var e = data.entregas.filter(function (x) { return x.id === id; })[0];
      if (!e) { e = data.entregas.filter(function (x) { return (x.repartidorId || 'r1') === c && x.estado === 'pendiente'; })[0]; }
      if (!e) return null;
      e.estado = 'firmada'; e.firmaTipo = firmaTipo || 'DIGITAL';
      e.firmaData = firmaData || null; e.receptor = receptor || 'Recepción'; e.firmaTs = now();
      e.conforme = true;                 // la firma = aprobación de recepción conforme
      if (factura) e.factura = factura;
      persist(); return e;
    },
    recepcionesConformes: function () { return data.entregas.filter(function (e) { return e.conforme; }).sort(function (a, b) { return (b.firmaTs || 0) - (a.firmaTs || 0); }); },

    // ── Documentos / OCR (simulado) ──
    addDocumento: function (doc) {
      doc = doc || {};
      var veh = data.vehiculos.filter(function (v) { return v.repartidorId === (data.repartidor ? data.repartidor.id : 'r1'); })[0];
      var n = {
        id: uid('doc'), tipo: doc.tipo || 'BOLETA',
        monto: doc.monto != null ? doc.monto : 30000 + Math.floor(Math.random() * 25000),
        rut: doc.rut || ('76.' + (100 + Math.floor(Math.random() * 800)) + '.' + (100 + Math.floor(Math.random() * 800)) + '-K'),
        folio: doc.folio || ('000-' + (1000 + Math.floor(Math.random() * 8999))),
        fraude: doc.fraude != null ? doc.fraude : Math.round(Math.random() * 18) / 100,
        cliente: doc.cliente || '',
        repartidor: doc.repartidor || (data.repartidor ? data.repartidor.nombre : 'Repartidor'),
        patente: doc.patente || (veh ? veh.patente : ''),
        pdf: doc.pdf || null,          // dataURL del PDF (foto escaneada)
        archivo: doc.archivo || '',
        formato: doc.pdf ? 'PDF' : (doc.formato || ''),
        // Campos estructurados del timbre electrónico (SII) o ingreso manual
        dteTipo: doc.dteTipo || '',
        dteNombre: doc.dteNombre || '',
        rutReceptor: doc.rutReceptor || '',
        fecha: doc.fecha || '',
        glosa: doc.glosa || '',
        fuente: doc.fuente || '',
        // Forma de pago + 6 campos solicitados
        formaPago: (doc.formaPago || '').toUpperCase(),
        codigoCliente: doc.codigoCliente || '',
        codigoTransporte: doc.codigoTransporte || '',
        ordenCompra: doc.ordenCompra || '',
        valorSinIva: Number(doc.valorSinIva) || 0,
        valorConIva: Number(doc.valorConIva) || Number(doc.monto) || 0,
        // ── Cuadre del día: estado del comprobante de pago (para rendir cuadrado) ──
        clientReqId: doc.clientReqId || '',
        tieneComprobante: !!(doc.comprobantePagoPdf || doc.comprobante_pago_url),
        pagoMonto: Number(doc.pagoMonto) || 0,
        pagoFecha: doc.pagoFecha || '',
        pagoReferencia: doc.pagoReferencia || '',
        pagoRutOrigen: doc.pagoRutOrigen || '',
        pagoDetalle: doc.pagoDetalle || null,
        motivoFallida: doc.motivoFallida || '',   // si la factura no se entregó (rechazo/otro)
        estado: doc.estado || 'RECIBIDO_PLANTA',  // llega directo a planta
        ts: now()
      };
      // Dedupe por clientReqId: si la cola reintenta el MISMO documento, NO lo dupliques en el cuadre
      // (sumaría dos veces el efectivo a rendir y descuadraría la caja). Si ya existe, lo reemplaza.
      if (n.clientReqId) {
        for (var _qi = 0; _qi < data.documentos.length; _qi++) {
          if (data.documentos[_qi].clientReqId && data.documentos[_qi].clientReqId === n.clientReqId) {
            n.id = data.documentos[_qi].id; n.ts = data.documentos[_qi].ts || n.ts;
            data.documentos[_qi] = n; persist(); return n;
          }
        }
      }
      data.documentos.push(n); persist(); return n;
    },
    documentos: function () { return data.documentos.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); },
    marcarDocumento: function (id, estado) { var x = data.documentos.filter(function (d) { return d.id === id; })[0]; if (x) { x.estado = estado || 'REVISADO'; persist(); } return x; },
    // Marca un documento como "con comprobante" tras adjuntarlo después (busca por clientReqId).
    actualizarComprobante: function (clientReqId, pago) {
      pago = pago || {};
      var d = data.documentos.filter(function (x) { return x.clientReqId && x.clientReqId === clientReqId; })[0];
      if (!d) return null;
      d.tieneComprobante = true;
      if (pago.monto != null && pago.monto !== '') d.pagoMonto = Number(pago.monto) || d.pagoMonto;
      if (pago.fecha) d.pagoFecha = pago.fecha;
      if (pago.ref) d.pagoReferencia = pago.ref;
      if (pago.rutOrigen) d.pagoRutOrigen = pago.rutOrigen;
      persist(); return d;
    },
    // Libera el PDF base64 local de una factura YA subida a la nube (evita llenar localStorage).
    purgarPdf: function (clientReqId) {
      var d = data.documentos.filter(function (x) { return x.clientReqId && x.clientReqId === clientReqId; })[0];
      if (d && d.pdf) { d.pdf = null; persist(); }
      return !!d;
    },
    // Corrige la forma de pago / monto de una factura YA enviada (la que aparece en el cuadre).
    // El cuadreDia se recalcula solo: si pasa a efectivo o crédito puro, deja de exigir comprobante.
    corregirPago: function (clientReqId, pago) {
      pago = pago || {};
      var d = data.documentos.filter(function (x) { return x.clientReqId && x.clientReqId === clientReqId; })[0];
      if (!d) return null;
      if (pago.formaPago != null && pago.formaPago !== '') d.formaPago = String(pago.formaPago).toUpperCase();
      if (pago.monto != null && pago.monto !== '' && !isNaN(Number(pago.monto))) { d.valorConIva = Number(pago.monto); d.monto = Number(pago.monto); }
      if (pago.detalle !== undefined) d.pagoDetalle = pago.detalle || null;
      d.pagoCorregido = true; d.pagoCorregidoTs = now();
      persist(); return d;
    },
    // Cuadre del día: efectivo a rendir + electrónico respaldado + lo que falta de comprobante.
    cuadreDia: function () {
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0); var t0 = hoy.getTime();
      var docs = data.documentos.filter(function (d) { return (d.ts || 0) >= t0; });
      var efectivo = 0, electronicoOk = 0, pendienteMonto = 0, aCobrarDespues = 0, pendientes = [], porPago = {};
      docs.forEach(function (d) {
        if ((d.estado || '') === 'FALLIDA') return; // factura NO entregada (rechazo/otro): no es venta, no entra al cuadre de pagos
        var fp = (d.formaPago || '').toUpperCase();
        var tot = Number(d.valorConIva) || Number(d.monto) || 0;
        porPago[fp || '—'] = (porPago[fp || '—'] || 0) + tot;
        var det = d.pagoDetalle || null;
        var efDet = (det && det.EFECTIVO) ? Number(det.EFECTIVO) : (fp === 'EFECTIVO' ? tot : 0);
        // Crédito (fiado a plazo): NO necesita comprobante; es "a cobrar después", no un pendiente del chofer.
        var esCreditoPuro = fp.indexOf('CREDITO') >= 0 && fp.indexOf('MIXTO') < 0;
        var credDet = (det && det.CREDITO) ? Number(det.CREDITO) : (esCreditoPuro ? tot : 0);
        efectivo += efDet;
        aCobrarDespues += credDet;
        var soloEfMix = fp === 'MIXTO' && det && Object.keys(det).length && Object.keys(det).every(function (k) { return k === 'EFECTIVO'; });
        var requiere = fp && fp !== 'EFECTIVO' && !soloEfMix && !esCreditoPuro;
        if (requiere) {
          var noEf = tot - efDet - credDet; // parte electrónica (transfer/débito/cheque) que SÍ necesita respaldo
          if (noEf > 0) {
            if (d.tieneComprobante) electronicoOk += noEf; else { pendienteMonto += noEf; pendientes.push(d); }
          }
        }
      });
      // Arrastre: facturas de días ANTERIORES que requieren comprobante y aún no lo tienen (no se borran a medianoche).
      var pendientesArrastre = [], arrastreMonto = 0;
      data.documentos.forEach(function (d) {
        if ((d.ts || 0) >= t0) return;
        if ((d.estado || '') === 'FALLIDA') return; // no entregada: fuera del arrastre
        var fp = (d.formaPago || '').toUpperCase();
        if (!fp || fp === 'EFECTIVO') return;
        if (fp.indexOf('CREDITO') >= 0 && fp.indexOf('MIXTO') < 0) return; // crédito puro no exige comprobante
        var det = d.pagoDetalle || null;
        var soloEfMix = fp === 'MIXTO' && det && Object.keys(det).length && Object.keys(det).every(function (k) { return k === 'EFECTIVO'; });
        if (soloEfMix || d.tieneComprobante) return;
        var tot = Number(d.valorConIva) || Number(d.monto) || 0;
        var efDet = (det && det.EFECTIVO) ? Number(det.EFECTIVO) : 0;
        var credDet = (det && det.CREDITO) ? Number(det.CREDITO) : 0;
        if (tot - efDet - credDet > 0) { arrastreMonto += (tot - efDet - credDet); pendientesArrastre.push(d); }
      });
      var fallidas = docs.filter(function (d) { return (d.estado || '') === 'FALLIDA'; });
      var vendidas = docs.filter(function (d) { return (d.estado || '') !== 'FALLIDA'; });
      return {
        n: vendidas.length,
        totalFacturado: vendidas.reduce(function (s, d) { return s + (Number(d.valorConIva) || Number(d.monto) || 0); }, 0),
        efectivo: efectivo, electronicoOk: electronicoOk, pendienteMonto: pendienteMonto, aCobrarDespues: aCobrarDespues,
        pendientesArrastre: pendientesArrastre, arrastreMonto: arrastreMonto, arrastreN: pendientesArrastre.length,
        pendientes: pendientes, porPago: porPago,
        fallidas: fallidas, fallidasN: fallidas.length,
        docs: vendidas.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
      };
    },

    // ── Incidencias (repartidor → planta) ──
    incidencias: function () { return data.incidencias.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); },
    addIncidencia: function (i) {
      var faltante = Math.max(0, (Number(i.esperada) || 0) - (Number(i.entregada) || 0));
      if (!faltante && i.faltante) faltante = Number(i.faltante) || 0;
      var tipoNota = TIPO_NOTA[i.tipo] || 'CREDITO';
      // Contexto del repartidor / camión (por defecto el repartidor actual)
      var rid = i.repartidorId || (data.repartidor ? data.repartidor.id : 'r1');
      var rnom = i.repartidor || (data.repartidor ? data.repartidor.nombre : 'Repartidor');
      var veh = data.vehiculos.filter(function (v) { return v.repartidorId === rid; })[0];
      var pat = i.patente || (veh ? veh.patente : '');
      // Precio unitario REAL si el chofer lo ingresa; si no, estimación de referencia (marcada).
      var precioUnit = Number(i.precioUnit) || 0;
      var precioUsado = precioUnit > 0 ? precioUnit : PRECIO_UNIT_REF;
      var n = {
        id: uid('i'), producto: i.producto || 'Producto', tipo: i.tipo || 'MAL_ESTADO',
        esperada: Number(i.esperada) || 0, entregada: Number(i.entregada) || 0, faltante: faltante,
        motivo: i.motivo || '', estado: 'REPORTADA',
        repartidorId: rid, repartidor: rnom, patente: pat,
        guia: i.guia || '', factura: i.factura || '', cliente: i.cliente || '',
        montoNota: faltante * precioUsado, montoEstimado: (precioUnit <= 0), precioUnit: precioUsado, tipoNota: tipoNota, ts: now()
      };
      data.incidencias.push(n);
      // refleja como alerta en el dashboard
      data.alertas.unshift({ id: uid('a'), titulo: 'Incidencia · ' + rnom + (pat ? (' (' + pat + ')') : ''), detalle: n.producto + ' · ' + n.tipo.replace(/_/g, ' ').toLowerCase() + (n.factura ? (' · fact ' + n.factura) : ''), severidad: 'MEDIA', scoreIA: 0.5, estado: 'ABIERTA' });
      persist(); return n;
    },
    resolverIncidencia: function (id) {
      var i = data.incidencias.filter(function (x) { return x.id === id; })[0];
      if (i) { i.estado = (i.estado === 'RESUELTA') ? 'REPORTADA' : 'RESUELTA'; persist(); }
      return i;
    },

    // ── Portal: facturas / pagos / disputas (SIMULADO, sin dinero real) ──
    facturas: function () { return data.facturas.slice(); },
    pagarFactura: function (id, medio) {
      var f = data.facturas.filter(function (x) { return x.id === id; })[0];
      if (!f) return null;
      f.pagada = true; f.estado = 'PAGADA'; f.diasVencido = 0;
      if (f.promesa && f.promesa.estado === 'VIGENTE') f.promesa.estado = 'CUMPLIDA';
      var pago = { id: uid('pago'), facturaId: f.id, folio: f.folio, monto: f.monto, medio: medio || 'WEBPAY', simulado: true, ts: now() };
      data.pagos.push(pago);
      // Cash application: el pago genera movimiento bancario + asiento del libro (ref = folio)
      // → quedan listos para que autoConciliar los cuadre automáticamente.
      data.banco.push({ id: uid('b'), fecha: now(), glosa: 'Pago ' + (f.cliente || 'cliente') + ' (' + (medio || 'WEBPAY') + ')', monto: f.monto, ref: f.folio, medio: medio || 'WEBPAY', conciliado: false, matchId: null });
      data.libro.push({ id: uid('l'), fecha: now(), glosa: 'Aplicación de pago factura ' + f.folio, monto: f.monto, ref: f.folio, origen: 'AR', conciliado: false, matchId: null });
      persist(); return pago;
    },
    addDisputa: function (dsp) {
      var n = { id: uid('dsp'), facturaId: dsp.facturaId, folio: dsp.folio, monto: dsp.monto, motivo: dsp.motivo || '', estado: 'ABIERTA', ts: now() };
      data.disputas.push(n);
      data.alertas.unshift({ id: uid('a'), titulo: 'Disputa de factura ' + (dsp.folio || ''), detalle: dsp.motivo || '', severidad: 'MEDIA', scoreIA: 0.4, estado: 'ABIERTA' });
      persist(); return n;
    },

    // ── Alertas (dashboard) ──
    alertas: function () { return data.alertas.slice(); },
    resolverAlerta: function (id) {
      var a = data.alertas.filter(function (x) { return x.id === id; })[0];
      if (a) { a.estado = (a.estado === 'RESUELTA') ? 'ABIERTA' : 'RESUELTA'; persist(); }
      return a;
    },

    // ── KPIs derivados ──
    kpiRepartidor: function () {
      var c = (data.repartidor ? data.repartidor.id : 'r1');
      var es = data.entregas.filter(function (e) { return (e.repartidorId || 'r1') === c; });
      var firmadas = es.filter(function (e) { return e.estado === 'firmada'; });
      var efectivo = firmadas.reduce(function (s, e) { return s + (e.monto || 0); }, 0);
      return { total: es.length, firmadas: firmadas.length, pendientes: es.length - firmadas.length, efectivo: efectivo, progreso: es.length ? Math.round(firmadas.length / es.length * 100) : 0 };
    },
    kpiPlanta: function () {
      var inc = data.incidencias;
      var abiertas = inc.filter(function (i) { return i.estado !== 'RESUELTA'; });
      var sinRev = inc.filter(function (i) { return i.estado === 'REPORTADA'; });
      var porTipo = {};
      abiertas.forEach(function (i) { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1; });
      var cred = abiertas.filter(function (i) { return i.tipoNota === 'CREDITO'; });
      var cobro = abiertas.filter(function (i) { return i.tipoNota === 'COBRO'; });
      var sum = function (arr) { return arr.reduce(function (s, i) { return s + (i.montoNota || 0); }, 0); };
      // Ranking: qué repartidor tiene más problemas (incidencias abiertas)
      var rep = {};
      abiertas.forEach(function (i) {
        var key = i.repartidor || 'Sin asignar';
        if (!rep[key]) rep[key] = { nombre: key, patente: i.patente || '', count: 0, monto: 0 };
        rep[key].count++; rep[key].monto += (i.montoNota || 0);
        if (!rep[key].patente && i.patente) rep[key].patente = i.patente;
      });
      var ranking = Object.keys(rep).map(function (k) { return rep[k]; }).sort(function (a, b) { return b.count - a.count; });
      return {
        incidenciasAbiertas: abiertas.length, sinRevisar: sinRev.length, porTipo: porTipo,
        notas: { credito: { cantidad: cred.length, monto: sum(cred) }, cobro: { cantidad: cobro.length, monto: sum(cobro) } },
        porRepartidor: ranking,
        ultimas: abiertas.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 12)
      };
    },
    kpiPortal: function () {
      var fs = data.facturas;
      var pend = fs.filter(function (f) { return !f.pagada; });
      var venc = pend.filter(function (f) { return f.diasVencido > 0; });
      var s = function (arr) { return arr.reduce(function (a, f) { return a + (f.monto || 0); }, 0); };
      return { totalPendiente: s(pend), totalVencido: s(venc), facturas: fs.length };
    },
    kpiDashboard: function () {
      var difCaja = data.repartidores.reduce(function (s, r) { return s + Math.abs(Math.min(0, r.difCaja || 0)); }, 0);
      var enTransito = data.repartidores.filter(function (r) { return r.estado === 'EN_RUTA'; }).reduce(function (s, r) { return s + (r.efectivoSalida || 0); }, 0);
      var pendientes = data.incidencias.filter(function (i) { return i.estado !== 'RESUELTA'; }).length
        + data.facturas.filter(function (f) { return !f.pagada; }).length
        + data.alertas.filter(function (a) { return a.estado !== 'RESUELTA'; }).length;
      return { diferenciaCaja: difCaja, dineroEnTransito: enTransito, conciliacionesPendientes: pendientes };
    },

    // ── Suscripción a cambios (misma página y entre páginas) ──
    on: function (cb) {
      global.addEventListener('cp-change', cb);
      global.addEventListener('storage', function (e) {
        if (e.key === KEY) { data = load() || data; cb(); }
      });
    },
    refresh: function () { data = load() || data; return data; }
  };

  // ── Flota / camiones ───────────────────────────────────────────────────────
  function latlngToXY(lat, lng) {
    var x = ((lng - (-70.82)) / (((-70.50)) - (-70.82))) * 100;
    var y = (((-33.35) - lat) / (((-33.35)) - (-33.58))) * 100;
    var cl = function (v) { return Math.max(4, Math.min(96, v)); };
    return { x: cl(x), y: cl(y) };
  }
  function haversineKm(la1, lo1, la2, lo2) { var R = 6371, toR = Math.PI / 180; var dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR; var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(a)); }
  CP.vehiculos = function () { return data.vehiculos.slice(); };
  CP.addVehiculo = function (v) {
    var n = {
      id: uid('v'), patente: (v.patente || '').toUpperCase(), conductor: v.conductor || '',
      repartidorId: v.repartidorId || null, tipo: v.tipo || 'Camión', ruta: v.ruta || '',
      estado: 'EN_RUTA', lat: -33.45, lng: -70.66, vel: 0, x: 50, y: 50, ts: now()
    };
    data.vehiculos.push(n); persist(); return n;
  };
  CP.updateVehiculo = function (id, patch) {
    var v = data.vehiculos.filter(function (x) { return x.id === id; })[0];
    if (v) { for (var k in patch) { v[k] = patch[k]; } persist(); }
    return v;
  };
  CP.removeVehiculo = function (id) {
    data.vehiculos = data.vehiculos.filter(function (x) { return x.id !== id; }); persist();
  };
  CP.setPosicion = function (ref, lat, lng, vel) {
    var v = data.vehiculos.filter(function (x) { return x.repartidorId === ref || x.patente === ref || x.id === ref; })[0];
    if (!v) return null;
    if (v.lat != null && v.lng != null) { var dkm = haversineKm(v.lat, v.lng, lat, lng); if (dkm < 5) v.km = Math.round(((v.km || 0) + dkm) * 100) / 100; }
    v.lat = lat; v.lng = lng; v.vel = Math.round(vel || 0);
    var xy = latlngToXY(lat, lng); v.x = xy.x; v.y = xy.y;
    v.estado = (v.vel > 5) ? 'EN_RUTA' : 'DETENIDO'; v.ts = now();
    persist(); return v;
  };

  // ── Conciliación bancaria: cartola vs libro/ERP ────────────────────────────
  function normRef(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  CP.banco = function () { return data.banco.slice(); };
  CP.libro = function () { return data.libro.slice(); };
  CP.addBancoLines = function (rows) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (!r) return;
      data.banco.push({ id: uid('b'), fecha: r.fecha || now(), glosa: r.glosa || 'Movimiento', monto: Number(r.monto) || 0, ref: r.ref || '', rut: r.rut || '', medio: r.medio || 'TRANSFERENCIA', banco: r.banco || '', conciliado: false, matchId: null }); n++;
    });
    if (n) persist(); return n;
  };
  CP.addLibroLines = function (rows) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (!r) return;
      data.libro.push({ id: uid('l'), fecha: r.fecha || now(), glosa: r.glosa || 'Registro', monto: Number(r.monto) || 0, ref: r.ref || '', origen: r.origen || 'ERP', conciliado: false, matchId: null }); n++;
    });
    if (n) persist(); return n;
  };
  CP.addDocumentosBulk = function (rows) {
    var n = 0; (rows || []).forEach(function (r) { data.documentos.push({ id: uid('doc'), tipo: r.tipo || 'DOC', monto: r.monto || 0, rut: r.rut || '', folio: r.folio || '', fraude: r.fraude != null ? r.fraude : 0.05, archivo: r.archivo || '', ts: now() }); n++; });
    if (n) persist(); return n;
  };
  function emparejarGrupo(bancoArr, libroArr, metodo) {
    var mid = uid('m'), t = now();
    bancoArr.forEach(function (b) { b.conciliado = true; b.matchId = mid; b.metodo = metodo; b.matchTs = t; });
    libroArr.forEach(function (l) { l.conciliado = true; l.matchId = mid; l.metodo = metodo; l.matchTs = t; });
    return mid;
  }
  // Subconjunto (2 o 3 líneas) cuya suma ≈ objetivo, dentro de tolerancia → matching N:1 / parcial
  function buscarSubconjunto(items, target, tol) {
    var n = items.length, i, j, k;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      if (Math.abs(items[i].monto + items[j].monto - target) <= tol) return [items[i], items[j]];
    }
    for (i = 0; i < n && i < 25; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) {
      if (Math.abs(items[i].monto + items[j].monto + items[k].monto - target) <= tol) return [items[i], items[j], items[k]];
    }
    return null;
  }
  CP.autoConciliar = function (opts) {
    opts = opts || {};
    var tolMonto = Number(opts.tolMonto) || 0;
    var tolPct = Number(opts.tolPct) || 0;
    function tolOf(m) { return Math.max(tolMonto, Math.abs(m) * tolPct / 100); }
    var tolDias = (opts.tolDias != null) ? Number(opts.tolDias) : 3;
    var porRef = opts.porRef !== false;
    var parciales = opts.parciales !== false;
    var dayMs = 864e5;
    var res = { exacto: 0, referencia: 0, rut: 0, tolerancia: 0, parcial: 0 };
    // 1) Exacto: monto idéntico + referencia idéntica
    data.banco.forEach(function (b) {
      if (b.conciliado || !b.ref) return;
      var l = data.libro.filter(function (x) { return !x.conciliado && x.monto === b.monto && normRef(x.ref) && normRef(x.ref) === normRef(b.ref); })[0];
      if (l) { emparejarGrupo([b], [l], 'EXACTO'); res.exacto++; }
    });
    // 2) Por referencia: misma referencia, monto dentro de tolerancia
    if (porRef) data.banco.forEach(function (b) {
      if (b.conciliado || !b.ref) return;
      var l = data.libro.filter(function (x) { return !x.conciliado && normRef(x.ref) && normRef(x.ref) === normRef(b.ref) && Math.abs(x.monto - b.monto) <= tolOf(b.monto); })[0];
      if (l) { emparejarGrupo([b], [l], 'REFERENCIA'); res.referencia++; }
    });
    // 2.5) Por RUT + monto (transferencia del cliente)
    data.banco.forEach(function (b) {
      if (b.conciliado || !b.rut) return;
      var l = data.libro.filter(function (x) { return !x.conciliado && x.rut && normRef(x.rut) === normRef(b.rut) && Math.abs(x.monto - b.monto) <= tolOf(b.monto); })[0];
      if (l) { emparejarGrupo([b], [l], 'RUT'); res.rut++; }
    });
    // 3) Tolerancia: monto dentro de tolerancia + fecha dentro de la ventana
    data.banco.forEach(function (b) {
      if (b.conciliado) return;
      var l = data.libro.filter(function (x) { return !x.conciliado && Math.abs(x.monto - b.monto) <= tolOf(b.monto) && Math.abs((x.fecha || 0) - (b.fecha || 0)) <= tolDias * dayMs; })[0];
      if (l) { emparejarGrupo([b], [l], 'TOLERANCIA'); res.tolerancia++; }
    });
    // 4) Parcial / N:1: una línea de banco = suma de 2‑3 líneas de libro
    if (parciales) data.banco.forEach(function (b) {
      if (b.conciliado) return;
      var cand = data.libro.filter(function (x) { return !x.conciliado; });
      var combo = buscarSubconjunto(cand, b.monto, tolOf(b.monto));
      if (combo) { emparejarGrupo([b], combo, 'PARCIAL'); res.parcial++; }
    });
    persist(); return res;
  };
  // Conciliación manual N:M (suma de un lado ≈ suma del otro)
  CP.conciliarManual = function (bancoIds, libroIds, tol) {
    tol = tol || 1000;
    var bs = data.banco.filter(function (x) { return bancoIds.indexOf(x.id) >= 0 && !x.conciliado; });
    var ls = data.libro.filter(function (x) { return libroIds.indexOf(x.id) >= 0 && !x.conciliado; });
    if (!bs.length || !ls.length) return { ok: false, motivo: 'Selecciona al menos 1 de cada lado' };
    var sb = bs.reduce(function (s, x) { return s + x.monto; }, 0);
    var sl = ls.reduce(function (s, x) { return s + x.monto; }, 0);
    if (Math.abs(sb - sl) > tol) return { ok: false, motivo: 'Los montos no cuadran: ' + clp(sb) + ' vs ' + clp(sl) };
    emparejarGrupo(bs, ls, (bs.length > 1 || ls.length > 1) ? 'MANUAL-NM' : 'MANUAL');
    persist(); return { ok: true };
  };
  CP.conciliar = function (bancoId, libroId) { return CP.conciliarManual([bancoId], [libroId], 0).ok; };
  // Aging de partidas no conciliadas (banco + libro)
  CP.agingPendientes = function () {
    var t = now(), B = { b0: { n: 0, m: 0 }, b1: { n: 0, m: 0 }, b2: { n: 0, m: 0 }, b3: { n: 0, m: 0 } };
    data.banco.concat(data.libro).filter(function (x) { return !x.conciliado; }).forEach(function (x) {
      var dias = Math.floor((t - (x.fecha || t)) / 864e5);
      var k = dias <= 7 ? 'b0' : (dias <= 30 ? 'b1' : (dias <= 60 ? 'b2' : 'b3'));
      B[k].n++; B[k].m += (x.monto || 0);
    });
    return B;
  };
  // Cobranza: aging de cuentas por cobrar (facturas) + DSO aproximado
  CP.agingAR = function () {
    var t = now(), pend = data.facturas.filter(function (f) { return !f.pagada; });
    var bk = { corriente: { n: 0, m: 0 }, d30: { n: 0, m: 0 }, d60: { n: 0, m: 0 }, d90: { n: 0, m: 0 } };
    pend.forEach(function (f) {
      var venc = Math.floor((t - (f.vencimiento || t)) / 864e5);
      var k = venc <= 0 ? 'corriente' : (venc <= 30 ? 'd30' : (venc <= 60 ? 'd60' : 'd90'));
      bk[k].n++; bk[k].m += (f.monto || 0);
    });
    var dso = pend.length ? Math.round(pend.reduce(function (s, f) { return s + Math.max(0, (t - (f.emision || t)) / 864e5); }, 0) / pend.length) : 0;
    return { buckets: bk, dso: dso, totalPendiente: pend.reduce(function (s, f) { return s + (f.monto || 0); }, 0), facturas: pend.length };
  };
  CP.exportConciliacionCSV = function () {
    var rows = [['lado', 'fecha', 'glosa', 'monto', 'ref', 'estado', 'metodo', 'matchId']];
    function fdt(ts) { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return ''; } }
    function add(arr, lado) { arr.forEach(function (x) { rows.push([lado, fdt(x.fecha), '"' + String(x.glosa || '').replace(/"/g, '""') + '"', x.monto, x.ref || '', x.conciliado ? 'CONCILIADO' : 'PENDIENTE', x.metodo || '', x.matchId || '']); }); }
    add(data.banco, 'BANCO'); add(data.libro, 'LIBRO');
    return rows.map(function (r) { return r.join(','); }).join('\n');
  };

  // ── Carga / descarga masiva de facturas y notas (todo entrelazado) ─────────
  function csvOf(headers, rows) {
    var esc = function (c) { var s = String(c == null ? '' : c); return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s; };
    return [headers.join(',')].concat(rows.map(function (r) { return r.map(esc).join(','); })).join('\n');
  }
  function fdtIso(ts) { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return ''; } }
  CP.addFacturasLines = function (rows) {
    var t = now(), n = 0;
    (rows || []).forEach(function (r) {
      if (!r || !r.monto) return;
      var venc = r.vencimiento || t, dias = Math.floor((t - venc) / 864e5);
      data.facturas.push({ id: uid('f'), folio: String(r.folio || (8900 + data.facturas.length + 1)), cliente: r.cliente || 'Cliente', monto: Number(r.monto) || 0, emision: r.emision || t, vencimiento: venc, pagada: !!r.pagada, estado: r.pagada ? 'PAGADA' : (dias > 0 ? 'VENCIDA' : 'PENDIENTE'), diasVencido: r.pagada ? 0 : Math.max(0, dias) });
      n++;
    });
    if (n) persist(); return n;
  };
  CP.addNotasLines = function (rows) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (!r || !r.monto) return;
      var tipo = r.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO';
      data.notas.push({ id: uid('n'), folio: String(r.folio || ((tipo === 'CREDITO' ? 'NC-' : 'ND-') + (1000 + data.notas.length + 1))), tipo: tipo, dte: tipo === 'CREDITO' ? 61 : 56, cliente: r.cliente || '', factura: r.factura || '', monto: Number(r.monto) || 0, motivo: r.motivo || '', estado: r.estado || 'EMITIDA', ts: now() });
      n++;
    });
    if (n) persist(); return n;
  };
  CP.exportFacturasCSV = function () { return csvOf(['folio', 'cliente', 'emision', 'vencimiento', 'monto', 'estado', 'pagada', 'recordatorios', 'promesa'], data.facturas.map(function (f) { return [f.folio, f.cliente, fdtIso(f.emision), fdtIso(f.vencimiento), f.monto, f.estado, f.pagada ? 'SI' : 'NO', f.recordatorios || 0, (f.promesa ? fdtIso(f.promesa.fecha) : '')]; })); };
  CP.exportNotasCSV = function () { return csvOf(['folio', 'tipo', 'dte', 'cliente', 'factura', 'monto', 'estado', 'motivo'], data.notas.map(function (n) { return [n.folio, n.tipo, n.dte, n.cliente, n.factura, n.monto, n.estado, n.motivo]; })); };
  CP.exportAuditCSV = function () { return csvOf(['fecha', 'actor', 'accion', 'entidad', 'detalle'], data.audit.map(function (a) { var dd; try { dd = new Date(a.ts).toISOString(); } catch (e) { dd = ''; } return [dd, a.actor, a.accion, a.entidad, a.detalle]; })); };

  // ── Carga masiva de entregas / planificación de rutas (logística) ──────────
  CP.addEntregasLines = function (rows) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (!r) return;
      var rid = null;
      if (r.patente) { var v = data.vehiculos.filter(function (x) { return x.patente && x.patente.toUpperCase() === String(r.patente).toUpperCase(); })[0]; if (v) rid = v.repartidorId; }
      if (!rid && r.repartidor) { var rr = data.repartidores.filter(function (x) { return (x.nombre || '').toLowerCase().indexOf(String(r.repartidor).toLowerCase()) >= 0; })[0]; if (rr) rid = rr.id; }
      if (!rid) rid = (data.repartidor ? data.repartidor.id : 'r1');
      data.entregas.push({ id: uid('e'), repartidorId: rid, cliente: r.cliente || 'Cliente', direccion: r.direccion || '', monto: Number(r.monto) || 0, kilos: Number(r.kilos) || 0, volumen: Number(r.volumen) || 0, guia: r.guia || '', factura: r.factura || '', lat: (r.lat != null ? Number(r.lat) : -33.45 + (Math.random() - 0.5) * 0.18), lng: (r.lng != null ? Number(r.lng) : -70.66 + (Math.random() - 0.5) * 0.22), estado: 'pendiente', ts: now() });
      n++;
    });
    if (n) persist(); return n;
  };
  CP.exportEntregasCSV = function () { return csvOf(['repartidor', 'patente', 'cliente', 'direccion', 'factura', 'guia', 'kilos', 'volumen', 'monto', 'estado', 'conforme', 'receptor'], data.entregas.map(function (e) { var v = data.vehiculos.filter(function (x) { return x.repartidorId === (e.repartidorId || 'r1'); })[0] || {}; var r = data.repartidores.filter(function (x) { return x.id === (e.repartidorId || 'r1'); })[0] || {}; return [r.nombre || '', v.patente || '', e.cliente, e.direccion || '', e.factura || '', e.guia || '', e.kilos || 0, e.volumen || 0, e.monto || 0, e.estado, e.conforme ? 'SI' : 'NO', e.receptor || '']; })); };

  // ── Alertas de operación de flota ──────────────────────────────────────────
  CP.alertasFlota = function () {
    var out = [];
    data.vehiculos.forEach(function (v) {
      if (v.estado === 'DETENIDO') out.push({ patente: v.patente, conductor: v.conductor, tipo: 'DETENIDO', detalle: 'Camión detenido' });
      else if ((v.vel || 0) > 90) out.push({ patente: v.patente, conductor: v.conductor, tipo: 'EXCESO', detalle: 'Exceso de velocidad (' + v.vel + ' km/h)' });
    });
    return out;
  };
  CP.generarAlertasFlota = function () {
    var al = CP.alertasFlota(), n = 0;
    al.forEach(function (a) {
      var dup = data.alertas.filter(function (x) { return x.estado !== 'RESUELTA' && x.titulo === 'Flota · ' + a.tipo && x.detalle.indexOf(a.patente) >= 0; }).length > 0;
      if (!dup) { data.alertas.unshift({ id: uid('a'), titulo: 'Flota · ' + a.tipo, detalle: a.patente + ' · ' + a.detalle, severidad: a.tipo === 'EXCESO' ? 'ALTA' : 'MEDIA', scoreIA: 0.5, estado: 'ABIERTA' }); n++; }
    });
    if (n) persist(); return n;
  };
  CP.desconciliar = function (matchId) {
    [].concat(data.banco, data.libro).forEach(function (x) {
      if (x.matchId === matchId) { x.conciliado = false; x.matchId = null; x.metodo = null; }
    });
    persist();
  };
  CP.kpiConciliacion = function () {
    var b = data.banco, l = data.libro;
    var bc = b.filter(function (x) { return x.conciliado; });
    var lc = l.filter(function (x) { return x.conciliado; });
    var total = b.length + l.length;
    var conc = bc.length + lc.length;
    var montoConc = bc.reduce(function (s, x) { return s + (x.monto || 0); }, 0);
    var montoPend = b.filter(function (x) { return !x.conciliado; }).reduce(function (s, x) { return s + (x.monto || 0); }, 0);
    return {
      totalBanco: b.length, totalLibro: l.length,
      conciliadosBanco: bc.length, conciliadosLibro: lc.length,
      pendientesBanco: b.length - bc.length, pendientesLibro: l.length - lc.length,
      montoConciliado: montoConc, montoPendiente: montoPend,
      tasa: total ? Math.round(conc / total * 100) : 0
    };
  };

  // ── Trazabilidad: bitácora de auditoría de cada operación ──────────────────
  function pushAudit(actor, accion, entidad, detalle, refId) {
    data.audit.unshift({ id: uid('au'), ts: now(), actor: actor || 'Usuario', accion: accion, entidad: entidad || '', refId: refId || '', detalle: detalle || '' });
    if (data.audit.length > 600) data.audit.length = 600;
    persist();
  }
  CP.audit = function () { return data.audit.slice(); };
  CP.auditFiltrar = function (q) {
    q = (q || '').toLowerCase();
    return data.audit.filter(function (a) { return !q || (a.accion + ' ' + a.entidad + ' ' + a.detalle + ' ' + a.actor).toLowerCase().indexOf(q) >= 0; });
  };
  CP.registrarEvento = function (accion, entidad, detalle, refId) { pushAudit('Usuario', accion, entidad, detalle, refId); };

  // ── Notas de crédito / débito (DTE 61 / 56) ────────────────────────────────
  CP.notas = function () { return data.notas.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); };
  CP.crearNota = function (n) {
    var tipo = n.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO';
    var nota = { id: uid('n'), folio: n.folio || ((tipo === 'CREDITO' ? 'NC-' : 'ND-') + (1000 + data.notas.length + 1)), tipo: tipo, dte: tipo === 'CREDITO' ? 61 : 56, cliente: n.cliente || '', factura: n.factura || '', monto: Number(n.monto) || 0, motivo: n.motivo || '', estado: n.estado || 'EMITIDA', incidenciaId: n.incidenciaId || null, ts: now() };
    data.notas.push(nota); persist(); return nota;
  };
  CP.generarNotaDesdeIncidencia = function (incId) {
    var i = data.incidencias.filter(function (x) { return x.id === incId; })[0];
    if (!i) return null;
    if (i.notaId) { var ex = data.notas.filter(function (x) { return x.id === i.notaId; })[0]; if (ex) return ex; }
    var nota = CP.crearNota({ tipo: i.tipoNota === 'COBRO' ? 'DEBITO' : 'CREDITO', cliente: i.cliente, factura: i.factura, monto: i.montoNota, motivo: i.producto + ' · ' + String(i.tipo).replace(/_/g, ' ').toLowerCase(), incidenciaId: i.id });
    i.notaId = nota.id; persist(); return nota;
  };
  CP.emitirNota = function (id) { var n = data.notas.filter(function (x) { return x.id === id; })[0]; if (n) { n.estado = 'EMITIDA'; persist(); } return n; };
  CP.anularNota = function (id) { var n = data.notas.filter(function (x) { return x.id === id; })[0]; if (n) { n.estado = 'ANULADA'; persist(); } return n; };
  CP.kpiNotas = function () {
    var nn = data.notas, em = nn.filter(function (n) { return n.estado === 'EMITIDA'; });
    var s = function (a) { return a.reduce(function (x, n) { return x + (n.monto || 0); }, 0); };
    var cred = em.filter(function (n) { return n.tipo === 'CREDITO'; }), deb = em.filter(function (n) { return n.tipo === 'DEBITO'; });
    return { total: nn.length, emitidas: em.length, borradores: nn.filter(function (n) { return n.estado === 'BORRADOR'; }).length, credito: cred.length, debito: deb.length, montoCredito: s(cred), montoDebito: s(deb) };
  };

  // ── Gestión de facturas (lado empresa / AR) ────────────────────────────────
  CP.facturasGestion = function () { return data.facturas.slice().sort(function (a, b) { return (b.emision || 0) - (a.emision || 0); }); };
  CP.marcarPagada = function (id) { var f = data.facturas.filter(function (x) { return x.id === id; })[0]; if (f) { f.pagada = true; f.estado = 'PAGADA'; f.diasVencido = 0; persist(); } return f; };
  CP.anularFactura = function (id) { var f = data.facturas.filter(function (x) { return x.id === id; })[0]; if (f) { f.estado = 'ANULADA'; f.pagada = false; persist(); } return f; };
  CP.notaPorFactura = function (id) { var f = data.facturas.filter(function (x) { return x.id === id; })[0]; if (!f) return null; return CP.crearNota({ tipo: 'CREDITO', cliente: f.cliente, factura: f.folio, monto: f.monto, motivo: 'Nota de crédito por factura ' + f.folio }); };
  CP.recordarFactura = function (id) { var f = data.facturas.filter(function (x) { return x.id === id; })[0]; if (!f) return null; f.recordatorios = (f.recordatorios || 0) + 1; f.ultimoRecordatorio = now(); data.alertas.unshift({ id: uid('a'), titulo: 'Recordatorio de cobranza · ' + (f.cliente || ''), detalle: 'Factura ' + f.folio + ' · ' + clp(f.monto), severidad: 'BAJA', scoreIA: 0.3, estado: 'ABIERTA' }); persist(); return f; };
  // Promise-to-pay: el cliente se compromete a pagar en N días
  CP.promesaPago = function (id, dias, monto) {
    var f = data.facturas.filter(function (x) { return x.id === id; })[0]; if (!f) return null;
    var d = Number(dias) || 7;
    f.promesa = { fecha: now() + d * 864e5, dias: d, monto: (monto != null ? monto : f.monto), estado: 'VIGENTE', ts: now() };
    data.alertas.unshift({ id: uid('a'), titulo: 'Promesa de pago · ' + (f.cliente || ''), detalle: 'Factura ' + f.folio + ' · ' + clp(f.monto) + ' en ' + d + ' días', severidad: 'BAJA', scoreIA: 0.3, estado: 'ABIERTA' });
    persist(); return f;
  };
  CP.promesasPago = function () {
    var t = now();
    return data.facturas.filter(function (f) { return f.promesa; }).map(function (f) {
      var p = f.promesa, estado = p.estado;
      if (estado === 'VIGENTE' && !f.pagada && p.fecha < t) estado = 'INCUMPLIDA';
      return { id: f.id, folio: f.folio, cliente: f.cliente, monto: p.monto, fecha: p.fecha, dias: p.dias, estado: estado };
    });
  };
  CP.kpiFacturas = function () {
    var fs = data.facturas, s = function (a) { return a.reduce(function (x, f) { return x + (f.monto || 0); }, 0); };
    var pag = fs.filter(function (f) { return f.pagada; }), pend = fs.filter(function (f) { return !f.pagada && f.estado !== 'ANULADA'; });
    return { total: fs.length, pagadas: pag.length, pendientes: pend.length, montoPagado: s(pag), montoPendiente: s(pend) };
  };

  // ── Cierre contable (checklist + certificación con segregación) ─────────────
  CP.cierreTareas = function () { return data.cierre.slice(); };
  CP.toggleTareaCierre = function (id) {
    var t = data.cierre.filter(function (x) { return x.id === id; })[0];
    if (t) { t.estado = (t.estado === 'LISTO') ? 'PENDIENTE' : 'LISTO'; persist(); }
    return t;
  };
  CP.cierreAvance = function () { var c = data.cierre; var ok = c.filter(function (t) { return t.estado === 'LISTO'; }).length; return { listas: ok, total: c.length, pct: c.length ? Math.round(ok / c.length * 100) : 0 }; };
  CP.certificacion = function () { return data.certificacion; };
  CP.certificarConciliacion = function (rol, actor) {
    var def = { PREPARADO: 'Contador', REVISADO: 'Supervisor', APROBADO: 'Gerente' };
    actor = actor || def[rol] || 'Usuario';
    data.certificacion = data.certificacion || {};
    if (rol === 'APROBADO') {
      var prep = data.certificacion.preparadoPor;
      if (prep && prep.actor === actor) return { ok: false, motivo: 'Segregación de funciones: quien prepara no puede aprobar' };
      data.certificacion.aprobadoPor = { actor: actor, ts: now() };
      data.certificacion.tasa = CP.kpiConciliacion().tasa;
    } else if (rol === 'PREPARADO') { data.certificacion.preparadoPor = { actor: actor, ts: now() }; }
    else if (rol === 'REVISADO') { data.certificacion.revisadoPor = { actor: actor, ts: now() }; }
    persist(); return { ok: true, cert: data.certificacion };
  };

  // ── Análisis de varianza / flux (vs período previo, demo) ──────────────────
  CP.varianza = function () {
    var kc = CP.kpiConciliacion(), ar = CP.agingAR();
    var pendConc = kc.pendientesBanco + kc.pendientesLibro;
    var inc = data.incidencias.filter(function (i) { return i.estado !== 'RESUELTA'; }).length;
    var items = [
      { concepto: 'Cuentas por cobrar', actual: ar.totalPendiente, previo: Math.round(ar.totalPendiente * 1.18), fmt: 'clp' },
      { concepto: 'DSO (días)', actual: ar.dso, previo: ar.dso + 6, fmt: 'num' },
      { concepto: 'Partidas no conciliadas', actual: pendConc, previo: pendConc + 5, fmt: 'num' },
      { concepto: 'Incidencias abiertas', actual: inc, previo: inc + 3, fmt: 'num' }
    ];
    items.forEach(function (it) { it.delta = it.actual - it.previo; it.pct = it.previo ? Math.round((it.actual - it.previo) / Math.abs(it.previo) * 100) : 0; });
    return items;
  };

  // ── Control por conductor (vivo) ──────────────────────────────────────────
  CP.resumenConductor = function (rid) {
    var r = data.repartidores.filter(function (x) { return x.id === rid; })[0] || {};
    var v = data.vehiculos.filter(function (x) { return x.repartidorId === rid; })[0] || {};
    var es = data.entregas.filter(function (e) { return (e.repartidorId || 'r1') === rid; }).sort(function (a, b) { return (a.orden || 999) - (b.orden || 999) || (a.ts || 0) - (b.ts || 0); });
    var inc = data.incidencias.filter(function (i) { return i.repartidorId === rid && i.estado !== 'RESUELTA'; });
    var sum = function (arr, k) { return arr.reduce(function (s, e) { return s + (e[k] || 0); }, 0); };
    return {
      id: rid, nombre: r.nombre || (v.conductor || rid), ini: r.ini || '', estado: r.estado || 'EN_RUTA',
      ruta: r.ruta || v.ruta || '', patente: v.patente || '', conductor: v.conductor || r.nombre || '', vehiculo: v.tipo || '', vel: v.vel || 0,
      totalEntregas: es.length, firmadas: es.filter(function (e) { return e.estado === 'firmada'; }).length,
      conformes: es.filter(function (e) { return e.conforme; }).length, pendientes: es.filter(function (e) { return e.estado === 'pendiente'; }).length,
      kilos: sum(es, 'kilos'), volumen: Math.round(sum(es, 'volumen') * 100) / 100, montoTotal: sum(es, 'monto'),
      facturas: es.map(function (e) { return e.factura; }).filter(Boolean),
      guias: es.map(function (e) { return e.guia; }).filter(Boolean),
      efectivoSalida: r.efectivoSalida || 0, difCaja: r.difCaja || 0, fraude: r.fraude || 0,
      incidencias: inc.length, entregas: es
    };
  };
  CP.conductores = function () { return data.repartidores.map(function (r) { return CP.resumenConductor(r.id); }); };
  // KPIs logísticos (panel logístico)
  CP.kpiLogistica = function (opts) {
    opts = opts || {};
    var vs = data.vehiculos.slice(), es = data.entregas.slice();
    if (opts.repartidorId) { vs = vs.filter(function (v) { return v.repartidorId === opts.repartidorId; }); es = es.filter(function (e) { return (e.repartidorId || 'r1') === opts.repartidorId; }); }
    var enRuta = vs.filter(function (v) { return v.estado === 'EN_RUTA'; }).length;
    var firmadas = es.filter(function (e) { return e.estado === 'firmada'; });
    var conformes = es.filter(function (e) { return e.conforme; }).length;
    var sum = function (arr, k) { return arr.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
    var firmasTs = firmadas.map(function (e) { return e.firmaTs || e.ts; }).filter(Boolean);
    var horas = firmasTs.length ? Math.max(1, (now() - Math.min.apply(null, firmasTs)) / 36e5) : 1;
    return {
      camiones: vs.length, enRuta: enRuta, detenidos: vs.length - enRuta,
      entregas: es.length, firmadas: firmadas.length, pendientes: es.length - firmadas.length,
      pctConformes: es.length ? Math.round(conformes / es.length * 100) : 0,
      kmTotal: Math.round(sum(vs, 'km') * 10) / 10, velProm: vs.length ? Math.round(sum(vs, 'vel') / vs.length) : 0,
      kilos: sum(es, 'kilos'), volumen: Math.round(sum(es, 'volumen') * 10) / 10,
      entregasHora: Math.round(firmadas.length / horas * 10) / 10, incidencias: data.incidencias.filter(function (i) { return i.estado !== 'RESUELTA'; }).length
    };
  };
  // Serie histórica de KPIs logísticos (últimos N días + hoy en vivo)
  CP.historico = function (dias) {
    dias = dias || 14;
    var hist = data.historico.slice(-dias);
    var k = CP.kpiLogistica();
    hist = hist.concat([{ fecha: now(), entregas: k.firmadas, km: k.kmTotal, conformes: k.pctConformes, incidencias: k.incidencias, kilos: k.kilos, hoy: true }]);
    return hist;
  };
  CP.exportHistoricoCSV = function () { return csvOf(['fecha', 'entregas', 'km', 'conformes_pct', 'incidencias', 'kilos'], CP.historico(30).map(function (d) { return [fdtIso(d.fecha), d.entregas, d.km, d.conformes, d.incidencias, d.kilos]; })); };
  // Serie por conductor (estable por rid) para comparación; último punto = hoy en vivo
  CP.historicoConductor = function (rid, dias) {
    dias = dias || 14; var DAY = 864e5, t = now(), arr = [], seed = 0;
    for (var i = 0; i < rid.length; i++) seed += rid.charCodeAt(i);
    function rnd(x) { var s = Math.sin(seed * 97.13 + x * 12.9898) * 43758.5453; return s - Math.floor(s); }
    for (var dd = dias; dd >= 1; dd--) { arr.push({ fecha: t - dd * DAY, entregas: 5 + Math.round(rnd(dd) * 10) + (seed % 5), conformes: 78 + Math.round(rnd(dd + 50) * 20) }); }
    var c = CP.resumenConductor(rid);
    arr.push({ fecha: t, entregas: c.firmadas, conformes: c.totalEntregas ? Math.round(c.conformes / c.totalEntregas * 100) : 0, hoy: true });
    return arr;
  };
  // KPIs de transportistas (rendimiento) para Planta
  CP.kpiTransportistas = function () {
    return data.repartidores.map(function (r) {
      var c = CP.resumenConductor(r.id);
      var pctConf = c.totalEntregas ? Math.round(c.conformes / c.totalEntregas * 100) : 0;
      var pctEnt = c.totalEntregas ? Math.round(c.firmadas / c.totalEntregas * 100) : 0;
      var score = Math.max(0, Math.min(100, Math.round(pctConf * 0.5 + pctEnt * 0.4 - c.incidencias * 5)));
      return { id: r.id, nombre: c.nombre, patente: c.patente, ruta: c.ruta, entregas: c.totalEntregas, firmadas: c.firmadas, conformes: c.conformes, pctConforme: pctConf, pctEntregado: pctEnt, kilos: c.kilos, incidencias: c.incidencias, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
  };
  // ── Fintoc (conector de cartola bancaria) · SIMULADO (sin clave/costo) ──────
  CP.fintocCartola = function (opts) {
    opts = opts || {};
    var BANKS = ['Banco de Chile', 'BCI', 'Santander', 'Scotiabank', 'Itaú'];
    var t = now(), pend = data.facturas.filter(function (f) { return !f.pagada && f.estado !== 'ANULADA'; }), n = 0;
    pend.forEach(function (f, idx) {
      data.banco.push({ id: uid('b'), fecha: t - Math.floor(Math.random() * 3) * 864e5 - Math.floor(Math.random() * 86400000), glosa: 'TEF ' + (f.cliente || ''), monto: f.monto, ref: '', rut: f.rut || '', medio: 'TRANSFERENCIA', banco: opts.banco || BANKS[idx % BANKS.length], comprobante: 'TEF-' + (100000 + Math.floor(Math.random() * 899999)), origen: 'FINTOC', conciliado: false, matchId: null }); n++;
    });
    data.banco.push({ id: uid('b'), fecha: t - 2 * 864e5 - Math.floor(Math.random() * 86400000), glosa: 'Depósito en efectivo', monto: 50000 + Math.floor(Math.random() * 200000), ref: '', rut: '', medio: 'EFECTIVO', banco: opts.banco || 'BancoEstado', comprobante: '', origen: 'FINTOC', conciliado: false, matchId: null }); n++;
    persist(); return n;
  };
  CP.bancos = function () { var s = {}; data.banco.forEach(function (b) { if (b.banco) s[b.banco] = 1; }); return Object.keys(s).sort(); };
  // Cruce factura emitida ↔ transferencia recibida (por folio / RUT+monto / monto+fecha)
  CP.cruzarFacturas = function (opts) {
    opts = opts || {}; var tol = Number(opts.tol) || 0, tolPct = Number(opts.tolPct) || 0, dias = (opts.tolDias != null ? Number(opts.tolDias) : 5);
    function tolOf(m) { return Math.max(tol, Math.abs(m) * tolPct / 100); }
    var res = { ref: 0, rut: 0, monto: 0 };
    var pendientes = function () { return data.facturas.filter(function (f) { return !f.pagada && f.estado !== 'ANULADA'; }); };
    data.banco.forEach(function (b) {
      if (b.conciliado) return;
      var fs = pendientes(), f = null, metodo = '';
      if (b.ref) { f = fs.filter(function (x) { return normRef(x.folio) === normRef(b.ref); })[0]; if (f) metodo = 'ref'; }
      if (!f && b.rut) { f = fs.filter(function (x) { return x.rut && normRef(x.rut) === normRef(b.rut) && Math.abs(x.monto - b.monto) <= tolOf(b.monto); })[0]; if (f) metodo = 'rut'; }
      if (!f) { f = fs.filter(function (x) { return Math.abs(x.monto - b.monto) <= tolOf(b.monto) && Math.abs((x.vencimiento || x.emision || 0) - (b.fecha || 0)) <= dias * 864e5; })[0]; if (f) metodo = 'monto'; }
      if (f) {
        f.pagada = true; f.estado = 'PAGADA'; f.diasVencido = 0; if (f.promesa && f.promesa.estado === 'VIGENTE') f.promesa.estado = 'CUMPLIDA';
        data.pagos.push({ id: uid('pago'), facturaId: f.id, folio: f.folio, monto: f.monto, medio: 'TRANSFERENCIA', simulado: true, ts: now() });
        var l = { id: uid('l'), fecha: b.fecha, glosa: 'AR factura ' + f.folio + ' ' + (f.cliente || ''), monto: f.monto, ref: f.folio, rut: f.rut || '', origen: 'AR', conciliado: false, matchId: null };
        data.libro.push(l);
        emparejarGrupo([b], [l], metodo === 'ref' ? 'EXACTO' : (metodo === 'rut' ? 'RUT' : 'MONTO'));
        res[metodo]++;
      }
    });
    persist(); return res;
  };
  // Optimización de ruta (nearest-neighbor desde la posición del camión)
  function _dist(a, b) { var dx = (a.lat - b.lat), dy = (a.lng - b.lng); return dx * dx + dy * dy; }
  CP.optimizarRuta = function (rid) {
    var v = data.vehiculos.filter(function (x) { return x.repartidorId === rid; })[0] || { lat: -33.45, lng: -70.66 };
    var pend = data.entregas.filter(function (e) { return (e.repartidorId || 'r1') === rid && e.estado === 'pendiente'; });
    var cur = { lat: v.lat, lng: v.lng }, rest = pend.slice(), ord = [];
    while (rest.length) { var bi = 0, bd = Infinity; for (var i = 0; i < rest.length; i++) { var d = _dist(cur, rest[i]); if (d < bd) { bd = d; bi = i; } } var nx = rest.splice(bi, 1)[0]; ord.push(nx); cur = { lat: nx.lat, lng: nx.lng }; }
    ord.forEach(function (e, i) { e.orden = i + 1; });
    persist(); return ord.length;
  };
  // Gestión de incidencias en planta
  CP.asignarIncidencia = function (id, responsable) { var i = data.incidencias.filter(function (x) { return x.id === id; })[0]; if (i) { i.responsable = responsable || ''; persist(); } return i; };
  CP.estadoIncidencia = function (id, estado) { var i = data.incidencias.filter(function (x) { return x.id === id; })[0]; if (i) { i.estado = estado; persist(); } return i; };
  CP.adjuntarEvidenciaIncidencia = function (id, docId) { var i = data.incidencias.filter(function (x) { return x.id === id; })[0]; if (!i) return null; if (!i.evidencias) i.evidencias = []; if (i.evidencias.indexOf(docId) < 0) i.evidencias.push(docId); persist(); return i; };
  CP.evidenciasIncidencia = function (id) { var i = data.incidencias.filter(function (x) { return x.id === id; })[0]; if (!i || !i.evidencias) return []; return i.evidencias.map(function (d) { return CP.getDocumento(d); }).filter(Boolean); };

  // ── Adjuntar PDF/documento como respaldo de una línea de conciliación ───────
  function _linea(lado, id) { var arr = lado === 'banco' ? data.banco : data.libro; return arr.filter(function (x) { return x.id === id; })[0]; }
  CP.getDocumento = function (id) { return data.documentos.filter(function (d) { return d.id === id; })[0]; };
  CP.adjuntarDocLinea = function (lado, lineId, docId) { var l = _linea(lado, lineId); if (!l) return null; if (!l.adjuntos) l.adjuntos = []; if (l.adjuntos.indexOf(docId) < 0) l.adjuntos.push(docId); persist(); return l; };
  CP.quitarAdjunto = function (lado, lineId, docId) { var l = _linea(lado, lineId); if (l && l.adjuntos) { l.adjuntos = l.adjuntos.filter(function (x) { return x !== docId; }); persist(); } return l; };
  CP.adjuntosDeLinea = function (lado, lineId) { var l = _linea(lado, lineId); if (!l || !l.adjuntos) return []; return l.adjuntos.map(function (id) { return CP.getDocumento(id); }).filter(Boolean); };
  // Sugerencias de match con score de confianza (AI suggested matches)
  CP.sugerencias = function (opts) {
    opts = opts || {}; var min = (opts.min != null ? opts.min : 55);
    var bs = data.banco.filter(function (x) { return !x.conciliado; });
    var ls = data.libro.filter(function (x) { return !x.conciliado; });
    var pairs = [];
    bs.forEach(function (b) {
      ls.forEach(function (l) {
        var diff = Math.abs(b.monto - l.monto), rel = b.monto ? diff / Math.abs(b.monto) : 1, s = 0, mot = [];
        if (diff === 0) { s += 55; mot.push('monto exacto'); }
        else if (rel <= 0.01) { s += 40; mot.push('monto ±1%'); }
        else if (rel <= 0.05) { s += 22; mot.push('monto ±5%'); }
        else return;
        if (b.ref && normRef(b.ref) === normRef(l.ref)) { s += 35; mot.push('referencia'); }
        if (b.rut && l.rut && normRef(b.rut) === normRef(l.rut)) { s += 25; mot.push('RUT'); }
        var dd = Math.abs((b.fecha || 0) - (l.fecha || 0)) / 864e5;
        if (dd <= 3) { s += 12; mot.push('fecha ±3d'); } else if (dd <= 7) { s += 6; }
        s = Math.min(100, s);
        if (s >= min) pairs.push({ bancoId: b.id, libroId: l.id, score: s, motivos: mot, glosaB: b.glosa, glosaL: l.glosa, monto: b.monto, montoL: l.monto });
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score; });
    var usedB = {}, usedL = {}, out = [];
    pairs.forEach(function (p) { if (usedB[p.bancoId] || usedL[p.libroId]) return; usedB[p.bancoId] = usedL[p.libroId] = 1; out.push(p); });
    return out;
  };
  // Detección de duplicados (misma cantidad + referencia)
  CP.duplicados = function () {
    var out = [];
    function scan(arr, lado) { var m = {}; arr.forEach(function (x) { if (!normRef(x.ref)) return; var k = x.monto + '|' + normRef(x.ref); (m[k] = m[k] || []).push(x); }); Object.keys(m).forEach(function (k) { if (m[k].length > 1) out.push({ lado: lado, monto: m[k][0].monto, ref: m[k][0].ref, n: m[k].length }); }); }
    scan(data.banco, 'banco'); scan(data.libro, 'libro');
    return out;
  };
  // Conciliar con ajuste (write-off de la diferencia → asiento de ajuste auto)
  CP.conciliarAjuste = function (bancoId, libroId) {
    var b = data.banco.filter(function (x) { return x.id === bancoId; })[0];
    var l = data.libro.filter(function (x) { return x.id === libroId; })[0];
    if (!b || !l || b.conciliado || l.conciliado) return { ok: false, motivo: 'línea no disponible' };
    var diff = Math.round((b.monto - l.monto) * 100) / 100, mid = uid('m'), t = now();
    b.conciliado = true; b.matchId = mid; b.metodo = 'AJUSTE'; b.matchTs = t;
    l.conciliado = true; l.matchId = mid; l.metodo = 'AJUSTE'; l.matchTs = t;
    if (diff !== 0) { data.libro.push({ id: uid('l'), fecha: b.fecha, glosa: 'Ajuste por diferencia (' + (diff > 0 ? '+' : '') + clp(diff) + ')', monto: diff, ref: l.ref || b.ref || '', origen: 'AJUSTE', conciliado: true, matchId: mid, metodo: 'AJUSTE', matchTs: t }); }
    persist(); return { ok: true, diff: diff };
  };
  // Cola de excepciones priorizada (no conciliadas, prioridad = monto × antigüedad)
  CP.excepciones = function () {
    var t = now(), out = [];
    function add(arr, lado) { arr.forEach(function (x) { if (x.conciliado) return; var dias = Math.max(0, Math.floor((t - (x.fecha || t)) / 864e5)); out.push({ lado: lado, id: x.id, glosa: x.glosa, monto: x.monto, ref: x.ref, rut: x.rut, dias: dias, prioridad: Math.round((Math.abs(x.monto) || 0) * (1 + dias / 30)) }); }); }
    add(data.banco, 'banco'); add(data.libro, 'libro');
    out.sort(function (a, b) { return b.prioridad - a.prioridad; });
    return out;
  };
  // Resumen ejecutivo de conciliación (por método)
  CP.conciliacionResumen = function () {
    var lines = data.banco.concat(data.libro), seen = {}, porMetodo = {};
    lines.forEach(function (x) { if (x.conciliado && x.matchId && !seen[x.matchId]) { seen[x.matchId] = 1; var m = x.metodo || 'OTRO'; porMetodo[m] = (porMetodo[m] || 0) + 1; } });
    var k = CP.kpiConciliacion();
    return { tasa: k.tasa, total: lines.length, conciliados: lines.filter(function (x) { return x.conciliado; }).length, pendientes: lines.filter(function (x) { return !x.conciliado; }).length, montoConciliado: k.montoConciliado, montoPendiente: k.montoPendiente, porMetodo: porMetodo, excepciones: lines.filter(function (x) { return !x.conciliado; }).length };
  };
  // Resumen por banco (cartola) — tasa y pendiente de cada banco
  CP.resumenPorBanco = function () {
    var m = {};
    data.banco.forEach(function (b) { var k = b.banco || '(sin banco)'; if (!m[k]) m[k] = { banco: k, total: 0, conc: 0, montoConc: 0, montoPend: 0 }; m[k].total++; if (b.conciliado) { m[k].conc++; m[k].montoConc += (b.monto || 0); } else { m[k].montoPend += (b.monto || 0); } });
    return Object.keys(m).map(function (k) { var x = m[k]; x.pend = x.total - x.conc; x.tasa = x.total ? Math.round(x.conc / x.total * 100) : 0; return x; }).sort(function (a, b) { return b.total - a.total; });
  };
  // Categorización contable de movimientos (transaction coding)
  var CATEGORIAS = ['Cobranza clientes', 'Pago proveedores', 'Remuneraciones', 'Impuestos', 'Comisiones bancarias', 'Depósitos', 'Transferencias internas', 'Otros'];
  function _cat(glosa, medio) {
    var g = (glosa || '').toLowerCase() + ' ' + (medio || '').toLowerCase();
    if (/remuner|sueldo|n[oó]mina|honorario|finiquito/.test(g)) return 'Remuneraciones';
    if (/iva|impuesto|sii|ppm|f29|tesorer[ií]a|tributar/.test(g)) return 'Impuestos';
    if (/comisi|mantenci[oó]n|cargo banco|gasto banco|portes/.test(g)) return 'Comisiones bancarias';
    if (/proveedor|compra|pago a |orden de compra|oc /.test(g)) return 'Pago proveedores';
    if (/dep[oó]sito|efectivo/.test(g)) return 'Depósitos';
    if (/traspaso|entre cuentas|cuenta propia|interna/.test(g)) return 'Transferencias internas';
    if (/tef|transfer|webpay|venta|factura|cobr|ar factura|rendici|guia|pago /.test(g)) return 'Cobranza clientes';
    return 'Otros';
  }
  function _catConReglas(glosa, medio) {
    var g = (glosa || '').toLowerCase();
    var r = data.reglas.filter(function (x) { return x.contiene && g.indexOf(x.contiene.toLowerCase()) >= 0; })[0];
    return r ? r.categoria : _cat(glosa, medio);
  }
  CP.categorias = function () { return CATEGORIAS.slice(); };
  CP.sugerirCategoria = function (glosa, medio) { return _catConReglas(glosa, medio); };
  CP.categorizar = function (lado, id, cat) { var arr = lado === 'banco' ? data.banco : data.libro; var x = arr.filter(function (y) { return y.id === id; })[0]; if (x) { x.categoria = cat; persist(); } return x; };
  CP.autoCategorizar = function () { var n = 0; data.banco.concat(data.libro).forEach(function (x) { if (!x.categoria) { x.categoria = _catConReglas(x.glosa, x.medio || x.origen); n++; } }); if (n) persist(); return n; };
  // Reglas guardadas: "si la glosa contiene X → categoría Y"
  CP.reglas = function () { return data.reglas.slice(); };
  CP.addRegla = function (contiene, categoria) { if (!contiene || !categoria) return null; var r = { id: uid('rg'), contiene: String(contiene), categoria: categoria }; data.reglas.push(r); persist(); return r; };
  CP.quitarRegla = function (id) { data.reglas = data.reglas.filter(function (x) { return x.id !== id; }); persist(); };
  CP.aplicarReglas = function () { var n = 0; data.banco.concat(data.libro).forEach(function (x) { var c = _catConReglas(x.glosa, x.medio || x.origen); if (x.categoria !== c) { x.categoria = c; n++; } }); if (n) persist(); return n; };
  CP.porCategoria = function () { var m = {}; data.banco.concat(data.libro).forEach(function (x) { var k = x.categoria || 'Sin categoría'; if (!m[k]) m[k] = { categoria: k, n: 0, monto: 0 }; m[k].n++; m[k].monto += (x.monto || 0); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.monto - a.monto; }); };
  // ── Conciliación intercompañía (entidades propias espejo: Matriz ↔ Filial) ───
  CP.intercompany = function () { return data.intercompany.slice(); };
  CP.addIntercompany = function (entidad, glosa, monto, ref, contraparte) { if (!entidad || !monto) return null; var r = { id: uid('ic'), entidad: entidad, contraparte: contraparte || '', glosa: String(glosa || ''), monto: Number(monto) || 0, ref: String(ref || ''), fecha: now(), conciliado: false, matchId: null }; data.intercompany.push(r); persist(); return r; };
  CP.autoIntercompany = function (opts) {
    opts = opts || {}; var tol = Number(opts.tol) || 0, pares = 0;
    data.intercompany.filter(function (x) { return x.entidad === 'Matriz' && !x.conciliado; }).forEach(function (m) {
      var f = data.intercompany.filter(function (x) { return x.entidad !== 'Matriz' && !x.conciliado && normRef(x.ref) === normRef(m.ref) && Math.abs((x.monto || 0) - (m.monto || 0)) <= tol; })[0];
      if (f) { var mid = uid('icm'); m.conciliado = true; m.matchId = mid; f.conciliado = true; f.matchId = mid; pares++; }
    });
    if (pares) persist(); return { pares: pares };
  };
  CP.desIntercompany = function (id) { var x = data.intercompany.filter(function (e) { return e.id === id; })[0]; if (!x || !x.matchId) return; data.intercompany.forEach(function (e) { if (e.matchId === x.matchId) { e.conciliado = false; e.matchId = null; } }); persist(); };
  CP.kpiIntercompany = function () {
    var arr = data.intercompany, conc = arr.filter(function (x) { return x.conciliado; }).length;
    var refs = {}; arr.forEach(function (x) { var k = normRef(x.ref); if (!refs[k]) refs[k] = []; refs[k].push(x); });
    var difs = 0, sinPar = 0;
    Object.keys(refs).forEach(function (k) {
      var g = refs[k]; var lados = {}; g.forEach(function (x) { lados[x.entidad] = (lados[x.entidad] || 0) + 1; });
      var entidades = Object.keys(lados);
      if (entidades.length < 2) { sinPar += g.filter(function (x) { return !x.conciliado; }).length; }
      else if (g.some(function (x) { return !x.conciliado; })) { var montos = {}; g.forEach(function (x) { montos[x.monto] = 1; }); if (Object.keys(montos).length > 1) difs++; }
    });
    return { total: arr.length, conciliados: conc, pendientes: arr.length - conc, diferencias: difs, sinContraparte: sinPar, tasa: arr.length ? Math.round(conc / arr.length * 100) : 0 };
  };
  // Detección de anomalías / antifraude sobre la cartola bancaria
  CP.anomalias = function () {
    var mv = data.banco, montos = mv.map(function (x) { return Math.abs(x.monto) || 0; });
    var mean = 0, std = 0;
    if (montos.length) { mean = montos.reduce(function (a, b) { return a + b; }, 0) / montos.length; std = Math.sqrt(montos.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / montos.length); }
    var dupKey = {}, rutDia = {};
    mv.forEach(function (x) { if (normRef(x.ref)) { var k = x.monto + '|' + normRef(x.ref); dupKey[k] = (dupKey[k] || 0) + 1; } if (x.rut) { var dk = normRef(x.rut) + '|' + new Date(x.fecha).toDateString(); rutDia[dk] = (rutDia[dk] || 0) + 1; } });
    var out = [];
    mv.forEach(function (x) {
      var motivos = [], score = 0, m = Math.abs(x.monto) || 0;
      if (montos.length > 3 && std > 0 && m > mean + 2 * std) { motivos.push('monto atípico'); score += 0.5; }
      var dia = new Date(x.fecha).getDay(); if (dia === 0 || dia === 6) { motivos.push('fin de semana'); score += 0.2; }
      if (m >= 500000 && m % 100000 === 0) { motivos.push('monto redondo alto'); score += 0.2; }
      if (normRef(x.ref) && dupKey[x.monto + '|' + normRef(x.ref)] > 1) { motivos.push('posible duplicado'); score += 0.4; }
      if (x.rut && rutDia[normRef(x.rut) + '|' + new Date(x.fecha).toDateString()] > 1) { motivos.push('múltiples pagos mismo RUT/día'); score += 0.3; }
      if (score > 0) out.push({ lado: 'banco', id: x.id, glosa: x.glosa, monto: x.monto, banco: x.banco, motivos: motivos, score: Math.min(1, Math.round(score * 100) / 100) });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  };
  CP.generarAlertasAnomalias = function () {
    var an = CP.anomalias(), n = 0;
    an.forEach(function (a) { if (a.score < 0.4) return; var dup = data.alertas.filter(function (x) { return x.estado !== 'RESUELTA' && x.titulo === 'Anomalía bancaria' && x.detalle.indexOf(a.glosa) >= 0; }).length > 0; if (!dup) { data.alertas.unshift({ id: uid('a'), titulo: 'Anomalía bancaria', detalle: a.glosa + ' · ' + clp(a.monto) + ' · ' + a.motivos.join(', '), severidad: a.score >= 0.7 ? 'ALTA' : 'MEDIA', scoreIA: a.score, estado: 'ABIERTA' }); n++; } });
    if (n) persist(); return n;
  };

  // Vincula automáticamente documentos (por folio/factura) a líneas con la misma referencia
  CP.vincularRespaldosPorFolio = function () {
    var n = 0;
    data.documentos.forEach(function (d) {
      if (!d.pdf) return;
      var key = normRef(d.folio || d.factura || '');
      if (!key) return;
      ['banco', 'libro'].forEach(function (lado) {
        (lado === 'banco' ? data.banco : data.libro).forEach(function (l) {
          if (normRef(l.ref) === key) { if (!l.adjuntos) l.adjuntos = []; if (l.adjuntos.indexOf(d.id) < 0) { l.adjuntos.push(d.id); n++; } }
        });
      });
    });
    if (n) persist(); return n;
  };

  // ── Auto-trazabilidad: envuelve operaciones clave para registrar en bitácora ─
  function wrapLog(name, accion, entidad) {
    var orig = CP[name]; if (typeof orig !== 'function') return;
    CP[name] = function () {
      var r = orig.apply(CP, arguments);
      try {
        var detalle = '';
        if (r && typeof r === 'object') {
          detalle = r.folio || r.patente || r.producto || r.glosa || r.cliente || '';
          if (r.monto != null) detalle += (detalle ? ' · ' : '') + clp(r.monto);
          if (r.exacto != null) detalle = 'exacto ' + r.exacto + ' · ref ' + (r.referencia || 0) + ' · tol ' + (r.tolerancia || 0) + ' · parcial ' + (r.parcial || 0);
        }
        pushAudit('Usuario', accion, entidad, detalle, (r && r.id) || '');
      } catch (e) { }
      return r;
    };
  }
  [
    ['addEntrega', 'Crear', 'Entrega'], ['firmarEntrega', 'Recepción conforme', 'Entrega'], ['addDocumento', 'Escaneo→Planta', 'Documento'], ['marcarDocumento', 'Revisar', 'Documento'],
    ['addIncidencia', 'Reportar', 'Incidencia'], ['resolverIncidencia', 'Resolver', 'Incidencia'],
    ['pagarFactura', 'Pago', 'Factura'], ['addDisputa', 'Disputa', 'Factura'], ['resolverAlerta', 'Resolver', 'Alerta'],
    ['autoConciliar', 'Auto-conciliar', 'Conciliación'], ['conciliarManual', 'Conciliar manual', 'Conciliación'], ['conciliarAjuste', 'Conciliar con ajuste', 'Conciliación'], ['desconciliar', 'Deshacer match', 'Conciliación'], ['adjuntarDocLinea', 'Adjuntar respaldo', 'Conciliación'], ['vincularRespaldosPorFolio', 'Vincular respaldos', 'Conciliación'],
    ['addBancoLines', 'Ingesta cartola', 'Banco'], ['addLibroLines', 'Ingesta libro', 'Libro'], ['addFacturasLines', 'Carga masiva', 'Factura'], ['addNotasLines', 'Carga masiva', 'Nota'], ['addEntregasLines', 'Carga masiva', 'Entrega'], ['generarAlertasFlota', 'Alertas flota', 'Vehículo'], ['optimizarRuta', 'Optimizar ruta', 'Entrega'], ['fintocCartola', 'Fintoc cartola', 'Banco'], ['cruzarFacturas', 'Cruce factura↔pago', 'Conciliación'], ['autoCategorizar', 'Auto-categorizar', 'Conciliación'], ['categorizar', 'Categorizar', 'Conciliación'], ['generarAlertasAnomalias', 'Anomalías→Control', 'Conciliación'], ['addRegla', 'Crear regla', 'Conciliación'], ['aplicarReglas', 'Aplicar reglas', 'Conciliación'], ['autoIntercompany', 'Auto-conciliar intercompañía', 'Intercompañía'], ['addIntercompany', 'Crear movimiento intercompañía', 'Intercompañía'], ['asignarIncidencia', 'Asignar', 'Incidencia'], ['estadoIncidencia', 'Cambiar estado', 'Incidencia'], ['adjuntarEvidenciaIncidencia', 'Evidencia', 'Incidencia'],
    ['addVehiculo', 'Crear', 'Vehículo'], ['removeVehiculo', 'Eliminar', 'Vehículo'],
    ['crearNota', 'Crear', 'Nota'], ['generarNotaDesdeIncidencia', 'Generar', 'Nota'], ['emitirNota', 'Emitir', 'Nota'], ['anularNota', 'Anular', 'Nota'],
    ['marcarPagada', 'Marcar pagada', 'Factura'], ['anularFactura', 'Anular', 'Factura'], ['notaPorFactura', 'Nota por factura', 'Nota'], ['recordarFactura', 'Recordatorio cobranza', 'Factura'], ['promesaPago', 'Promesa de pago', 'Factura'],
    ['toggleTareaCierre', 'Tarea cierre', 'Cierre'], ['certificarConciliacion', 'Certificar', 'Cierre']
  ].forEach(function (w) { wrapLog(w[0], w[1], w[2]); });

  global.CP = CP;
})(window);
