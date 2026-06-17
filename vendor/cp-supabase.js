/* ConciliaPro · Conexión directa a Supabase (sin backend propio).
   La app sube el PDF al Storage y guarda la factura en la tabla `documentos`.
   La anon key es pública (segura en el navegador) y está protegida por RLS. */
(function () {
  var URL = 'https://ekmkzaogpnnqcctcnqpr.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbWt6YW9ncG5ucWNjdGNucXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjE3NTAsImV4cCI6MjA5NjU5Nzc1MH0.4tuDPgrfsSXHsSiBVcrnDZbFymdR62wvJj0aSIdcm7s';
  // Headers con el JWT del conductor (de cp_token); fallback a anon antes de login.
  function tok() { return localStorage.getItem('cp_token') || KEY; }
  function H() { return { apikey: KEY, Authorization: 'Bearer ' + tok() }; }
  function perfil() { try { return JSON.parse(localStorage.getItem('cp_perfil') || '{}'); } catch (e) { return {}; } }

  function dataUrlToBlob(d) {
    var b = atob(d.split(',')[1]); var a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: 'application/pdf' });
  }

  function uploadPDF(dataUrl) {
    if (!dataUrl) return Promise.resolve(null);
    var name = 'dte-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6) + '.pdf';
    return fetch(URL + '/storage/v1/object/comprobantes/' + name, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/pdf' }, H()),
      body: dataUrlToBlob(dataUrl)
    }).then(function (r) { return r.ok ? (URL + '/storage/v1/object/public/comprobantes/' + name) : null; })
      .catch(function () { return null; });
  }

  // Inserta una factura. Sube el PDF primero (si hay) y guarda la fila.
  function insertDoc(doc) {
    return uploadPDF(doc.pdf).then(function (pdf_url) {
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
        gps: doc.gps || null, pdf_url: pdf_url, empresa_id: doc.empresaId || perfil().empresa_id || null
      };
      return fetch(URL + '/rest/v1/documentos', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=representation' }, H()),
        body: JSON.stringify(row)
      }).then(function (r) { if (!r.ok) throw new Error('insert ' + r.status); return r.json().then(function (a) { return a[0]; }); });
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
    return insertDoc(doc).catch(function (err) {
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
        return insertDoc(item.doc).then(function () { ok++; item._done = true; })
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
  // auto-sincroniza al recuperar señal y al abrir la app
  window.addEventListener('online', function () { sincronizarCola(); sincronizarEntregas(); });
  setTimeout(function () { if (navigator.onLine) { sincronizarCola(); sincronizarEntregas(); } }, 3000);

  window.CPSupabase = { URL: URL, KEY: KEY, uploadPDF: uploadPDF, insertDoc: insertDoc, insertDocSeguro: insertDocSeguro,
    listDocs: listDocs, marcarConciliado: marcarConciliado, extraerFactura: extraerFactura,
    sincronizarCola: sincronizarCola, pendientes: pendientes, bloqueados: bloqueados,
    cerrarEntrega: cerrarEntrega, sincronizarEntregas: sincronizarEntregas };
})();
