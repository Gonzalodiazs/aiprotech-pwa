/* AIPROTECH · Botón de soporte flotante + acceso a Privacidad y Seguridad.
   Se inyecta solo. Incluir con: <script src="./soporte.js"></script> */
(function(){
  if(window.__aipSoporte) return; window.__aipSoporte=1;
  var MAIL='s.gonzalodavid@gmail.com';
  var PRIV='./privacidad.html';
  var css=
   '.aip-sop-btn{position:fixed;right:18px;bottom:18px;z-index:9000;display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#F2A03D,#E07F1A);color:#2A1A05;border:none;border-radius:26px;padding:12px 18px;font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(199,117,20,.42);transition:transform .12s,box-shadow .12s}'
  +'.aip-sop-btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(199,117,20,.5)}'
  +'.aip-sop-btn svg{width:18px;height:18px}'
  +'.aip-sop-ov{position:fixed;inset:0;z-index:9001;background:rgba(20,25,30,.42);backdrop-filter:blur(2px);display:none;align-items:flex-end;justify-content:flex-end;padding:20px}'
  +'.aip-sop-ov.on{display:flex}'
  +'.aip-sop-card{background:#fff;border:1px solid #E8E4D9;border-radius:18px;width:100%;max-width:340px;padding:20px 20px 18px;box-shadow:0 20px 60px rgba(20,25,30,.28);font-family:"IBM Plex Sans",system-ui,sans-serif;animation:aipRise .22s ease both}'
  +'@keyframes aipRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}'
  +'.aip-sop-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}'
  +'.aip-sop-hd h3{font-size:16px;font-weight:700;color:#232A33;margin:0}'
  +'.aip-sop-x{background:none;border:none;font-size:20px;color:#8A929E;cursor:pointer;line-height:1;padding:2px 6px}'
  +'.aip-sop-card p{font-size:13px;color:#5C6573;margin:0 0 14px;line-height:1.55}'
  +'.aip-sop-a{display:flex;align-items:center;gap:11px;text-decoration:none;border:1px solid #E8E4D9;border-radius:12px;padding:12px 14px;margin-bottom:9px;transition:.12s}'
  +'.aip-sop-a:hover{border-color:#E07F1A;background:#FBF9F4}'
  +'.aip-sop-a .ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}'
  +'.aip-sop-a .ic.m{background:rgba(224,127,26,.14)}.aip-sop-a .ic.p{background:rgba(46,102,201,.13)}'
  +'.aip-sop-a .tx b{display:block;font-size:13.5px;color:#232A33;font-weight:600}'
  +'.aip-sop-a .tx span{font-size:11.5px;color:#8A929E}'
  +'.aip-sop-ft{font-size:10.5px;color:#A6ADB7;text-align:center;margin-top:8px}'
  +'@media print{.aip-sop-btn,.aip-sop-ov{display:none!important}}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  var btn=document.createElement('button');
  btn.className='aip-sop-btn'; btn.setAttribute('aria-label','Ayuda y soporte');
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#2A1A05" stroke-width="2.2" stroke-linecap="round"><path d="M12 17h.01M12 13a2.5 2.5 0 10-2.5-2.5"/><circle cx="12" cy="12" r="10"/></svg>Soporte';

  var ov=document.createElement('div'); ov.className='aip-sop-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
  ov.innerHTML=
    '<div class="aip-sop-card">'
   +'<div class="aip-sop-hd"><h3>¿Necesitas ayuda?</h3><button class="aip-sop-x" aria-label="Cerrar">&times;</button></div>'
   +'<p>¿Un problema con la aplicación o el sitio web? Escríbenos y te ayudamos directamente.</p>'
   +'<a class="aip-sop-a" href="mailto:'+MAIL+'?subject='+encodeURIComponent('Soporte AIPROTECH')+'&body='+encodeURIComponent('Cuéntanos qué problema tienes (y desde qué teléfono o navegador):\n\n')+'">'
     +'<span class="ic m"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9F5A0D" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg></span>'
     +'<span class="tx"><b>Escribir a soporte</b><span>'+MAIL+'</span></span></a>'
   +'<a class="aip-sop-a" href="'+PRIV+'">'
     +'<span class="ic p"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E66C9" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>'
     +'<span class="tx"><b>Privacidad y Seguridad</b><span>Cómo cuidamos tus datos</span></span></a>'
   +'<div class="aip-sop-ft">AIPROTECH · Comercial Santa Elena</div>'
   +'</div>';

  function open(){ ov.classList.add('on'); }
  function close(){ ov.classList.remove('on'); }
  btn.addEventListener('click', open);
  ov.addEventListener('click', function(e){ if(e.target===ov || e.target.classList.contains('aip-sop-x')) close(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });

  function mount(){ if(document.body){ document.body.appendChild(btn); document.body.appendChild(ov); } }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
