/* ConciliaPro · cp-auth.js (app repartidor) — autenticación por JWT (Edge Function cp-login).
   El conductor entra con su usuario + clave (patente). Guarda el JWT y lo usa cp-supabase.js. */
(function () {
  var SB_URL = 'https://ekmkzaogpnnqcctcnqpr.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbWt6YW9ncG5ucWNjdGNucXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjE3NTAsImV4cCI6MjA5NjU5Nzc1MH0.4tuDPgrfsSXHsSiBVcrnDZbFymdR62wvJj0aSIdcm7s';
  var TKEY = 'cp_token', PKEY = 'cp_perfil';
  var LOGIN = './login.html';

  function getToken() { try { return localStorage.getItem(TKEY); } catch (e) { return null; } }
  function getPerfil() { try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) { return null; } }
  function expMs(t) { try { return JSON.parse(atob(t.split('.')[1])).exp * 1000; } catch (e) { return 0; } }
  function valido() { var t = getToken(); return !!t && expMs(t) > Date.now(); }

  window.CPAuth = {
    SB_URL: SB_URL, ANON: ANON,
    login: function (usuario, clave) {
      return fetch(SB_URL + '/functions/v1/cp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
        body: JSON.stringify({ usuario: usuario, clave: clave })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.token) { throw new Error((res.j && res.j.error) || 'No se pudo iniciar sesión'); }
          localStorage.setItem(TKEY, res.j.token);
          localStorage.setItem(PKEY, JSON.stringify(res.j.perfil || {}));
          return res.j.perfil;
        });
    },
    token: getToken, perfil: getPerfil, valido: valido,
    requireSession: function () {
      if (!valido()) { try { localStorage.removeItem(TKEY); } catch (e) {} location.replace(LOGIN); return false; }
      return true;
    },
    logout: function () {
      localStorage.removeItem(TKEY); localStorage.removeItem(PKEY);
      location.replace(LOGIN);
    }
  };
})();
