/* AIPROTECH · Conexión directa a Supabase (sin backend propio).
   La app sube el PDF al Storage y guarda la factura en la tabla `documentos`.
   La anon key es pública (segura en el navegador) y está protegida por RLS. */
(function () {
  var URL = 'https://ekmkzaogpnnqcctcnqpr.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbWt6YW9ncG5ucWNjdGNucXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjE3NTAsImV4cCI6MjA5NjU5Nzc1MH0.4tuDPgrfsSXHsSiBVcrnDZbFymdR62wvJj0aSIdcm7s';
  // El repartidor usa la ANON key para datos. RLS ya está cerrado: documentos solo permite INSERT a anon
  // (no SELECT/UPDATE) y el insert va con Prefer:return=minimal. clientes/usuarios/app_state/audit_log
  // están cerrados a anon. El cp_token de cp-login SÍ es aceptado por PostgREST (la oficina lo usa), pero
  // el teléfono se queda en anon a propósito: es app de campo offline y el token expira a las 12h; anon
  // INSERT-only no expira y cubre lo único que el repartidor necesita (subir facturas). NO leer datos.
  function tok() { return KEY; }
  function H() { return { apikey: KEY, Authorization: 'Bearer ' + tok() }; }
  function perfil() { try { return JSON.parse(localStorage.getItem('cp_perfil') || '{}'); } catch (e) { return {}; } }

  function dataUrlToBlob(d) {
    var b = atob(d.split(',')[1]); var a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: 'application/pdf' });
  }

  function uploadPDF(dataUrl, prefix) {
    if (!dataUrl) return Promise.resolve(null);
    // dataURL corrupto/truncado (p. ej. leído de un localStorage lleno) → atob lanza SÍNCRONO.
    // Lo atrapamos para NO romper el envío de la factura: si el PDF falla, la fila se guarda igual sin él.
    var blob; try { blob = dataUrlToBlob(dataUrl); } catch (e) { return Promise.resolve(null); }
    var name = (prefix || 'dte') + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6) + '.pdf';
    return fetch(URL + '/storage/v1/object/comprobantes/' + name, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/pdf' }, H()),
      body: blob
    }).then(function (r) { return r.ok ? (URL + '/storage/v1/object/public/comprobantes/' + name) : null; })
      .catch(function () { return null; });
  }

  // POST de la fila. Si falla con 400 por columna inexistente (PGRST204) y se mandaron
  // campos "extra" (comprobante de pago), reintenta SIN ellos → la factura nunca se pierde
  // por falta de migración. extraKeys = nombres de las columnas nuevas a quitar en el reintento.
  function postFila(row, extraKeys) {
    return fetch(URL + '/rest/v1/documentos', {
      method: 'POST',
      // return=minimal: documentos está cerrado a SELECT anon (RLS). return=representation haría un
      // RETURNING que exige política SELECT → 42501. minimal NO devuelve body y el éxito no usa la fila.
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H()),
      body: JSON.stringify(row)
    }).then(function (r) {
      if (r.ok) return { _ok: true };
      // 409 = ya existe una fila con el mismo client_req_id (clave de idempotencia) → un reintento de la
      // cola tras "commit OK pero respuesta perdida" NO debe duplicar la factura. Lo tratamos como éxito.
      if (r.status === 409) return { _idempotente: true };
      if (r.status === 400 && extraKeys && extraKeys.length) {
        return r.text().then(function (t) {
          if (/PGRST204|schema cache|column/i.test(t || '')) {
            try { console.warn('[CP] columnas de comprobante de pago aún no existen; guardo la factura sin ese detalle. Ejecuta el ALTER TABLE de documentos.'); } catch (e) {}
            var base = {}; Object.keys(row).forEach(function (k) { if (extraKeys.indexOf(k) < 0) base[k] = row[k]; });
            return postFila(base, null);
          }
          throw new Error('insert 400');
        });
      }
      throw new Error('insert ' + r.status);
    });
  }

  // Inserta una factura. Sube el PDF de la factura y (si hay) el del comprobante de pago, luego guarda la fila.
  function insertDoc(doc) {
    return Promise.all([uploadPDF(doc.pdf, 'dte'), uploadPDF(doc.comprobantePagoPdf, 'pago')]).then(function (urls) {
      var pdf_url = urls[0], pago_url = urls[1];
      var row = {
        folio: doc.folio || '', dte_tipo: doc.dteTipo || '', dte_nombre: doc.dteNombre || doc.tipo || 'Documento',
        rut: doc.rut || '', rut_receptor: doc.rutReceptor || '', fecha: doc.fecha || '',
        monto: Number(doc.monto) || Number(doc.valorConIva) || 0, glosa: doc.glosa || '',
        // 6 campos solicitados
        codigo_cliente: doc.codigoCliente || '', codigo_transporte: doc.codigoTransporte || '',
        orden_compra: doc.ordenCompra || '',
        valor_sin_iva: Number(doc.valorSinIva) || 0, valor_con_iva: Number(doc.valorConIva) || Number(doc.monto) || 0,
        forma_pago: (doc.formaPago || '').toUpperCase(), firmante: doc.firmante || '',
        repartidor: doc.repartidor || perfil().nombre || '', patente: doc.patente || perfil().patente || '', fuente: doc.fuente || '',
        gps: doc.gps || null, pdf_url: pdf_url, empresa_id: doc.empresaId || perfil().empresa_id || null,
        // estado: normalmente lo pone la BD (RECIBIDO_PLANTA); se manda solo si viene marcado (ej. FALLIDA = no entregada)
        estado: doc.estado || undefined,
        // Validación de recepción: la factura física trae el timbre del proveedor + la firma del cliente
        timbre_proveedor: !!doc.timbreProveedor, firma_receptor: !!doc.firmaReceptor, visada: !!doc.visada
      };
      // ── Idempotencia + comprobante de pago (columnas nuevas; el insert se auto-sana si aún no existen) ──
      var extra = {};
      if (doc.clientReqId) extra.client_req_id = String(doc.clientReqId); // evita factura duplicada en reintentos de la cola
      if (pago_url) extra.comprobante_pago_url = pago_url;
      if (doc.pagoMonto != null && doc.pagoMonto !== '') { var pm = Number(doc.pagoMonto); if (pm) extra.pago_monto = pm; }
      if (doc.pagoFecha) extra.pago_fecha = String(doc.pagoFecha);
      if (doc.pagoReferencia) extra.pago_referencia = String(doc.pagoReferencia);
      if (doc.pagoRutOrigen) extra.pago_rut_origen = String(doc.pagoRutOrigen);
      if (doc.pagoDetalle) extra.pago_detalle = (typeof doc.pagoDetalle === 'string') ? doc.pagoDetalle : JSON.stringify(doc.pagoDetalle);
      var extraKeys = Object.keys(extra);
      var full = extraKeys.length ? Object.assign({}, row, extra) : row;
      return postFila(full, extraKeys);
    });
  }

  function listDocs() {
    return fetch(URL + '/rest/v1/documentos?select=*&order=ts.desc', { headers: H() })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }

  // IA de visión: manda la foto a la Edge Function (que llama a Gemini) y devuelve los datos
  function extraerFactura(imageBase64) {
    return fetch(URL + '/functions/v1/extraer-factura', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H()),
      body: JSON.stringify({ image: imageBase64 })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok) ? j.data : null; })
      .catch(function () { return null; });
  }

  function marcarConciliado(id, val) {
    return fetch(URL + '/rest/v1/documentos?id=eq.' + id, {
      method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H()),
      body: JSON.stringify({ conciliado: !!val })
    }).then(function (r) {
      if (!r.ok) throw new Error('marcar-conciliado ' + r.status);
      return { ok: true };
    }).catch(function (err) {
      try { console.warn('marcarConciliado falló:', err && err.message); } catch (e) {}
      return { ok: false, error: (err && err.message) || 'error' };
    });
  }

  // ── Cierre de entrega de la ruta (PATCH estado=entregada) con su propia cola offline ──
  // PATCH SOLO la columna 'estado' (garantizada); el receptor/firma viajan en el acta/documento.
  var EQKEY = 'cp_cola_entregas';
  function eqGet() { try { return JSON.parse(localStorage.getItem(EQKEY) || '[]'); } catch (e) { return []; } }
  function eqSet(a) { try { localStorage.setItem(EQKEY, JSON.stringify(a)); } catch (e) {} }
  function patchEntrega(id) {
    return fetch(URL + '/rest/v1/entregas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H()),
      body: JSON.stringify({ estado: 'entregada' })
    }).then(function (r) { if (!r.ok) throw new Error('patch-entrega ' + r.status); return true; });
  }
  function cerrarEntrega(id, meta) {
    if (!id) return Promise.resolve({ ok: false });
    return patchEntrega(id).then(function () { return { ok: true }; }).catch(function () {
      var q = eqGet(); q.push({ id: id, meta: meta || {}, t: new Date().getTime() }); eqSet(q);
      return { _encolado: true, pendientes: q.length };
    });
  }
  function sincronizarEntregas() {
    var q = eqGet(); if (!q.length) return Promise.resolve(0); var ok = 0;
    return q.reduce(function (p, it) {
      return p.then(function () { return patchEntrega(it.id).then(function () { ok++; it._done = true; }).catch(function () {}); });
    }, Promise.resolve()).then(function () { eqSet(q.filter(function (i) { return !i._done; })); return ok; });
  }

  // ── Cola OFFLINE: si no hay señal, guarda local y sincroniza al volver ──
  var QKEY = 'cp_cola_offline';
  function qGet() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } }
  function qSet(a) { try { localStorage.setItem(QKEY, JSON.stringify(a)); return true; } catch (e) { return false; } }

  function insertDocSeguro(doc) {
    // Promise.resolve().then(insertDoc) → cualquier throw SÍNCRONO de insertDoc se vuelve rechazo
    // y SÍ entra al .catch (se encola). Garantiza que jamás se pierda una factura ni se trabe el botón.
    return Promise.resolve().then(function () { return insertDoc(doc); }).catch(function (err) {
      var msg = (err && err.message) ? String(err.message) : 'sin conexión';
      var m = /insert\s+(\d{3})/.exec(msg);
      var status = m ? Number(m[1]) : 0;
      var permanente = status >= 400 && status < 500; // 401/403/400 no se arregla solo con señal
      try { console.warn('[CP] insertDoc encolado:', msg); } catch (e) {}
      var q = qGet(); q.push({ doc: doc, t: new Date().getTime(), err: msg, status: status, permanente: permanente });
      var saved = qSet(q); // si el almacenamiento está lleno, qSet=false → avisar (no perder en silencio)
      return { _encolado: true, pendientes: q.length, error: msg, permanente: permanente, _persistError: !saved };
    });
  }
  function sincronizarCola() {
    var q = qGet();
    if (!q.length) return Promise.resolve({ ok: 0, fallidos: 0 });
    var ok = 0;
    // procesa en serie para no saturar
    return q.reduce(function (p, item) {
      return p.then(function () {
        // Promise.resolve().then → un throw síncrono de insertDoc (p. ej. dataURL corrupto en la cola)
        // NO aborta todo el reduce: cae al .catch como "veneno" y los demás documentos se siguen reintentando.
        return Promise.resolve().then(function () { return insertDoc(item.doc); }).then(function () { ok++; item._done = true; })
          .catch(function (e) {
            item.intentos = (item.intentos || 0) + 1;
            item.err = (e && e.message) ? String(e.message) : item.err;
            var mm = /insert\s+(4\d\d)/.exec(item.err || '');
            if (mm || item.intentos >= 5) item._bloqueado = true; // veneno: no reintentar a ciegas (no se borra)
            try { console.warn('[CP] sincronizarCola falló folio=' + (item.doc && item.doc.folio) + ': ' + item.err); } catch (e2) {}
          });
      });
    }, Promise.resolve()).then(function () {
      var restantes = q.filter(function (i) { return !i._done; });
      qSet(restantes); // conserva pendientes Y bloqueados (nunca se pierde un documento)
      return { ok: ok, fallidos: restantes.length };
    });
  }
  function pendientes() { return qGet().length; }
  function bloqueados() { return qGet().filter(function (i) { return i._bloqueado; }); }

  // ── Comprobante de pago ADJUNTADO DESPUÉS (cuadre del día) ───────────────────────────
  // Actualiza una factura YA enviada (UPDATE por client_req_id). El UPDATE va con el cp_token
  // (authenticated) porque la anon key solo tiene INSERT en documentos (RLS). Sin señal o token
  // vencido → se encola en cp_cola_comprobantes y se reintenta al recuperar conexión / re-login.
  function authTok() { try { return localStorage.getItem('cp_token') || ''; } catch (e) { return ''; } }
  function attachComprobante(clientReqId, info) {
    info = info || {};
    if (!clientReqId) return Promise.reject(new Error('comprobante sin id'));
    return uploadPDF(info.pdf, 'pago').then(function (url) {
      var patch = {
        comprobante_pago_url: url || null,
        pago_monto: (info.monto != null && info.monto !== '') ? Number(info.monto) : null,
        pago_fecha: info.fecha || null, pago_referencia: info.ref || null, pago_rut_origen: info.rutOrigen || null
      };
      if (info.detalle) patch.pago_detalle = info.detalle;
      var tk = authTok();
      var hdrs = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + (tk || KEY), Prefer: 'return=representation' };
      var qs = URL + '/rest/v1/documentos?client_req_id=eq.' + encodeURIComponent(clientReqId);
      return fetch(qs, { method: 'PATCH', headers: hdrs, body: JSON.stringify(patch) }).then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('comprobante 401'); // token venció → re-login
        if (r.status === 400) { // columnas de pago aún sin migrar → reintenta solo con la URL
          return fetch(qs, { method: 'PATCH', headers: hdrs, body: JSON.stringify({ comprobante_pago_url: url || null }) })
            .then(function (r2) { if (!r2.ok) throw new Error('comprobante ' + r2.status); return r2.json(); })
            .then(function (a2) { if (!Array.isArray(a2) || !a2.length) throw new Error('comprobante 0'); return { _ok: true, url: url }; });
        }
        if (!r.ok) throw new Error('comprobante ' + r.status);
        return r.json().then(function (a) { if (!Array.isArray(a) || !a.length) throw new Error('comprobante 0'); return { _ok: true, url: url }; });
      });
    });
  }
  // Corrige la forma de pago / monto de una factura YA enviada (PATCH por client_req_id, con cp_token).
  // Best-effort: el cuadre local ya se corrigió antes (CP.corregirPago); esto refleja el cambio en la BD/oficina.
  function corregirPagoRemoto(clientReqId, info) {
    info = info || {};
    if (!clientReqId) return Promise.reject(new Error('correccion sin id'));
    var patch = {};
    if (info.formaPago != null && info.formaPago !== '') patch.forma_pago = String(info.formaPago).toUpperCase();
    if (info.monto != null && info.monto !== '' && !isNaN(Number(info.monto))) { patch.valor_con_iva = Number(info.monto); patch.monto = Number(info.monto); }
    if (info.detalle !== undefined) patch.pago_detalle = info.detalle || null;
    if (!Object.keys(patch).length) return Promise.resolve({ _ok: true, _noop: true });
    var tk = authTok();
    var hdrs = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + (tk || KEY), Prefer: 'return=representation' };
    var qs = URL + '/rest/v1/documentos?client_req_id=eq.' + encodeURIComponent(clientReqId);
    return fetch(qs, { method: 'PATCH', headers: hdrs, body: JSON.stringify(patch) }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('correccion 401'); // token venció → re-login
      if (r.status === 400 && patch.pago_detalle !== undefined) { // pago_detalle aún sin migrar → reintenta sin él
        var p2 = {}; Object.keys(patch).forEach(function (k) { if (k !== 'pago_detalle') p2[k] = patch[k]; });
        return fetch(qs, { method: 'PATCH', headers: hdrs, body: JSON.stringify(p2) })
          .then(function (r2) { if (!r2.ok) throw new Error('correccion ' + r2.status); return r2.json(); })
          .then(function (a2) { if (!Array.isArray(a2) || !a2.length) throw new Error('correccion 0'); return { _ok: true }; });
      }
      if (!r.ok) throw new Error('correccion ' + r.status);
      return r.json().then(function (a) { if (!Array.isArray(a) || !a.length) throw new Error('correccion 0'); return { _ok: true }; });
    });
  }
  var CQKEY = 'cp_cola_comprobantes';
  function cqGet() { try { return JSON.parse(localStorage.getItem(CQKEY) || '[]'); } catch (e) { return []; } }
  function cqSet(a) { try { localStorage.setItem(CQKEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function attachComprobanteSeguro(clientReqId, info) {
    return Promise.resolve().then(function () { return attachComprobante(clientReqId, info); })
      .catch(function (err) {
        var msg = (err && err.message) ? String(err.message) : 'sin conexión';
        var token = /401|403/.test(msg); // token venció: esperar re-login (no reintentar en bucle)
        var q = cqGet(); q.push({ clientReqId: clientReqId, info: info, err: msg, token: token, t: new Date().getTime() });
        var saved = cqSet(q);
        try { console.warn('[CP] comprobante encolado:', msg); } catch (e) {}
        return { _encolado: true, token: token, error: msg, pendientes: q.length, _persistError: !saved };
      });
  }
  // ¿El cp_token todavía es válido (no vencido)? Evita el bucle de reintento con token expirado.
  function tokenValido() { var t = authTok(); if (!t) return false; try { return JSON.parse(atob(t.split('.')[1])).exp * 1000 > Date.now(); } catch (e) { return false; } }
  function sincronizarComprobantes() {
    var q = cqGet(); if (!q.length) return Promise.resolve(0); var ok = 0;
    return q.reduce(function (p, item) {
      return p.then(function () {
        if (item.token && !tokenValido()) return; // token VENCIDO → no reintentar (corta el bucle 401); espera re-login
        // Si la factura del comprobante todavía está en la cola de inserts (aún no existe en BD),
        // saltar: PATCH por client_req_id daría 0 filas. Se reintenta cuando el insert ya subió.
        var insertPend = qGet().some(function (it) { return it.doc && it.doc.clientReqId === item.clientReqId; });
        if (insertPend) return;
        return attachComprobante(item.clientReqId, item.info).then(function () { ok++; item._done = true; })
          .catch(function (e) { item.intentos = (item.intentos || 0) + 1; item.err = (e && e.message) || item.err; item.token = /401|403/.test(item.err || ''); });
      });
    }, Promise.resolve()).then(function () { cqSet(q.filter(function (i) { return !i._done; })); return ok; });
  }
  function pendientesComprobantes() { return cqGet().length; }
  // auto-sincroniza al recuperar señal y al abrir la app (.catch evita "unhandled promise rejection").
  // Encadenado: primero suben los inserts, LUEGO los comprobantes (su PATCH necesita que la factura ya exista).
  function _sincronizarTodo() {
    try {
      sincronizarEntregas().catch(function () {});
      return sincronizarCola().catch(function () { return {}; }).then(function () { return sincronizarComprobantes(); }).catch(function () { return 0; });
    } catch (e) { return Promise.resolve(0); }
  }
  window.addEventListener('online', _sincronizarTodo);
  setTimeout(function () { if (navigator.onLine) _sincronizarTodo(); }, 3000);

  window.CPSupabase = { URL: URL, KEY: KEY, uploadPDF: uploadPDF, insertDoc: insertDoc, insertDocSeguro: insertDocSeguro,
    listDocs: listDocs, marcarConciliado: marcarConciliado, extraerFactura: extraerFactura,
    sincronizarCola: sincronizarCola, pendientes: pendientes, bloqueados: bloqueados,
    attachComprobante: attachComprobante, attachComprobanteSeguro: attachComprobanteSeguro,
    corregirPagoRemoto: corregirPagoRemoto,
    sincronizarComprobantes: sincronizarComprobantes, pendientesComprobantes: pendientesComprobantes,
    sincronizarTodo: _sincronizarTodo,
    cerrarEntrega: cerrarEntrega, sincronizarEntregas: sincronizarEntregas };
})();
