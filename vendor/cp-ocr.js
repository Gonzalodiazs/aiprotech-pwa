/* AIPROTECH · Lectura de timbre electrónico (PDF417) — 100% on-device, gratis.
   Decodifica el código PDF417 del timbre SII y extrae el TED (RUT, folio, fecha, monto).
   No requiere servidor ni OCR de pago: los datos vienen exactos del propio documento. */
(function () {
  var DTE = {
    '33': 'Factura electrónica', '34': 'Factura exenta', '39': 'Boleta electrónica',
    '41': 'Boleta exenta', '43': 'Liquidación-factura', '46': 'Factura de compra',
    '52': 'Guía de despacho', '56': 'Nota de débito', '61': 'Nota de crédito',
    '110': 'Factura de exportación', '111': 'Nota débito exportación', '112': 'Nota crédito exportación'
  };

  function canvasFrom(img, scale, crop) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var sx = 0, sy = 0, sw = iw, sh = ih;
    if (crop) { sx = crop.x; sy = crop.y; sw = crop.w; sh = crop.h; }
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * scale));
    cv.height = Math.max(1, Math.round(sh * scale));
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }

  function tryCanvas(cv) {
    try {
      var Z = window.ZXing;
      var hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.PDF_417]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      var src = new Z.HTMLCanvasElementLuminanceSource(cv);
      var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(src));
      var res = new Z.PDF417Reader().decode(bmp, hints);
      return res && res.getText ? res.getText() : null;
    } catch (e) { return null; }
  }

  // Intenta varias escalas y recortes: el timbre suele ir en el tercio inferior.
  function decodePDF417(img) {
    if (!window.ZXing) return null;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var attempts = [
      { scale: 1, crop: null },
      { scale: 1.6, crop: null },
      { scale: 0.8, crop: null },
      { scale: 1.8, crop: { x: 0, y: Math.round(ih * 0.55), w: iw, h: Math.round(ih * 0.45) } },
      { scale: 2.0, crop: { x: 0, y: Math.round(ih * 0.45), w: iw, h: Math.round(ih * 0.35) } }
    ];
    for (var i = 0; i < attempts.length; i++) {
      var t = tryCanvas(canvasFrom(img, attempts[i].scale, attempts[i].crop));
      if (t) return t;
    }
    return null;
  }

  function tag(node, name) {
    var e = node.getElementsByTagName(name)[0];
    return e ? (e.textContent || '').trim() : '';
  }

  // El payload del timbre es un XML <TED><DD>...</DD><FRMT>...</FRMT></TED>
  function parseTED(text) {
    if (!text) return null;
    // Limpia BOM / cualquier byte antes del XML (algunos lectores lo anteponen) → evita "Start tag expected".
    text = String(text).replace(/^[^<]*/, '').trim();
    if (!text) return null;
    try {
      var xml = new DOMParser().parseFromString(text, 'application/xml');
      var dd = xml.getElementsByTagName('DD')[0] || xml.documentElement;
      if (!dd) return null;
      var td = tag(dd, 'TD');
      var out = {
        rutEmisor: tag(dd, 'RE'),
        dteTipo: td,
        dteNombre: DTE[td] || (td ? 'DTE ' + td : 'Documento'),
        folio: tag(dd, 'F'),
        fecha: tag(dd, 'FE'),
        rutReceptor: tag(dd, 'RR'),
        razonReceptor: tag(dd, 'RSR'),
        monto: parseInt(tag(dd, 'MNT') || '0', 10) || 0,
        glosa: tag(dd, 'IT1'),
        fuente: 'Timbre PDF417 (SII)'
      };
      if (!out.rutEmisor && !out.folio && !out.monto) return null;
      return out;
    } catch (e) { return null; }
  }

  // Lector NATIVO del teléfono (BarcodeDetector): en Android lee PDF417 densos MUCHO mejor que ZXing-JS.
  // Defensivo: si no existe / no soporta pdf417 / falla / se cuelga, resuelve null y el flujo usa ZXing.
  function detectNative(source) {
    return new Promise(function (resolve) {
      try {
        if (typeof window.BarcodeDetector === 'undefined') return resolve(null);
        var fin = false;
        var to = setTimeout(function () { if (!fin) { fin = true; resolve(null); } }, 1500); // nunca colgar el escaneo
        Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : ['pdf417'])
          .then(function (fmts) {
            if (fin) return;
            if (fmts && fmts.indexOf('pdf417') < 0) { fin = true; clearTimeout(to); resolve(null); return; }
            return new window.BarcodeDetector({ formats: ['pdf417'] }).detect(source);
          })
          .then(function (codes) {
            if (fin) return; fin = true; clearTimeout(to);
            resolve(codes && codes.length ? (codes[0].rawValue || null) : null);
          })
          .catch(function () { if (!fin) { fin = true; clearTimeout(to); resolve(null); } });
      } catch (e) { resolve(null); }
    });
  }
  // Decodifica un PDF417 de una imagen: primero el lector nativo, si no, ZXing. Devuelve Promise<string|null>.
  function decodePDF417Async(img) {
    return detectNative(img).then(function (txt) {
      if (txt) return txt;
      try { return decodePDF417(img); } catch (e) { return null; }
    }).catch(function () { try { return decodePDF417(img); } catch (e) { return null; } });
  }
  function nativoDisponible() { return typeof window.BarcodeDetector !== 'undefined'; }

  window.CPScan = { decodePDF417: decodePDF417, decodePDF417Async: decodePDF417Async, detectNative: detectNative, nativoDisponible: nativoDisponible, parseTED: parseTED, DTE: DTE };
})();
