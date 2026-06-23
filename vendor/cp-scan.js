/* ConciliaPro · Escáner de documentos estilo iPhone (jscanify + OpenCV.js, MIT, gratis).
   Detecta los bordes del papel, recorta y endereza (corrección de perspectiva) → imagen lista para PDF.
   OpenCV se carga BAJO DEMANDA (la primera vez que se escanea), no en cada arranque. */
(function () {
  var API = {
    _ready: null,
    // Carga perezosa de OpenCV.js + jscanify
    load: function () {
      if (this._ready) return this._ready;
      this._ready = new Promise(function (resolve, reject) {
        function addScript(src, cb) {
          var s = document.createElement('script'); s.src = src; s.async = true;
          s.onload = cb; s.onerror = function () { reject(new Error('no-load ' + src)); };
          document.head.appendChild(s);
        }
        addScript('./vendor/opencv.js', function () {
          addScript('./vendor/jscanify.js', function () {
            var tries = 0;
            var t = setInterval(function () {
              if (window.cv && window.cv.Mat && window.jscanify) { clearInterval(t); resolve(true); }
              else if (++tries > 200) { clearInterval(t); reject(new Error('opencv-timeout')); }
            }, 100);
          });
        });
      });
      return this._ready;
    },
    _dist: function (a, b) { return Math.hypot((a.x - b.x), (a.y - b.y)); },
    /**
     * Escanea una imagen: detecta el documento y devuelve un canvas recortado/enderezado.
     * @param {HTMLImageElement|HTMLCanvasElement} imgEl
     * @returns {Promise<{canvas:HTMLCanvasElement|null, found:boolean}>}
     */
    scan: function (imgEl) {
      var self = this;
      return this.load().then(function () {
        try {
          var scanner = new window.jscanify();
          var src = cv.imread(imgEl);
          var contour = scanner.findPaperContour(src);
          if (!contour) { src.delete(); return { canvas: null, found: false }; }
          var corners = scanner.getCornerPoints(contour, src);
          contour.delete(); src.delete();   // libera el contorno (antes quedaba huérfano en cada escaneo → OOM)
          var tl = corners.topLeftCorner, tr = corners.topRightCorner,
              bl = corners.bottomLeftCorner, br = corners.bottomRightCorner;
          if (!tl || !tr || !bl || !br) return { canvas: null, found: false };
          // tamaño de salida = promedio de lados (mantiene proporción del documento)
          var w = Math.round((self._dist(tl, tr) + self._dist(bl, br)) / 2);
          var h = Math.round((self._dist(tl, bl) + self._dist(tr, br)) / 2);
          w = Math.max(500, Math.min(2200, w)); h = Math.max(650, Math.min(2600, h));
          var out = scanner.extractPaper(imgEl, w, h, corners);
          return { canvas: out, found: true };
        } catch (e) { return { canvas: null, found: false }; }
      }).catch(function () { return { canvas: null, found: false }; });
    }
  };
  window.CPDocScan = API;
})();
