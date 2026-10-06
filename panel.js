// panel.js — Panel de acceso de Tierra Buena (F911). Sin dependencias, sin llamadas a la nube.
// Hace 4 cosas: elegir la guía según el celular, instalar el panel con un toque (si el navegador lo deja),
// avisar cuando no hay internet y compartir el enlace.
(function () {
  'use strict';
  var doc = document, nav = navigator;
  var $ = function (id) { return doc.getElementById(id); };
  var esiOS = /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  var sinMovimiento = function () { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var instalada = function () { return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true); };
  var evInstalar = null;

  function decir(id, texto) { var e = $(id); if (e) e.textContent = texto || ''; }

  // ----- guía Android / iPhone -----
  function pestana(cual, enfocar) {
    var tabs = doc.querySelectorAll('.pestana');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i], sel = t.getAttribute('data-guia') === cual, p = $('guia-' + t.getAttribute('data-guia'));
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.setAttribute('tabindex', sel ? '0' : '-1');
      if (p) p.hidden = !sel;
      if (sel && enfocar) t.focus();
    }
  }
  function irALaGuia() {
    var g = $('guia'); if (!g) return;
    if (g.scrollIntoView) g.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
    if (g.focus) g.focus({ preventScroll: true });
    if (!sinMovimiento()) { g.classList.remove('resalta'); void g.offsetWidth; g.classList.add('resalta'); }
  }
  function iniciarPestanas() {
    var tabs = doc.querySelectorAll('.pestana');
    for (var i = 0; i < tabs.length; i++) {
      (function (t) {
        t.addEventListener('click', function () { pestana(t.getAttribute('data-guia'), false); });
        t.addEventListener('keydown', function (ev) {
          if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { pestana(t.getAttribute('data-guia') === 'android' ? 'iphone' : 'android', true); ev.preventDefault(); }
        });
      })(tabs[i]);
    }
    pestana(esiOS ? 'iphone' : 'android', false);
  }

  // ----- instalar -----
  function iniciarInstalar() {
    var b = $('btnInstalar'); if (!b) return;
    if (instalada()) { b.hidden = true; decir('msgInstalar', 'Ya está en tu celular. Ábrela siempre desde su ícono.'); return; }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); evInstalar = e; });
    window.addEventListener('appinstalled', function () { evInstalar = null; b.hidden = true; decir('msgInstalar', '¡Listo! Busca el ícono de Tierra Buena en tu pantalla.'); });
    b.addEventListener('click', function () {
      if (evInstalar) {
        var ev = evInstalar; evInstalar = null;
        try {
          ev.prompt();
          Promise.resolve(ev.userChoice).then(function (r) {
            decir('msgInstalar', r && r.outcome === 'accepted' ? '¡Listo! Busca el ícono de Tierra Buena en tu pantalla.' : 'Está bien, cuando quieras la instalas. Aquí abajo tienes los pasos.');
          }, function () { decir('msgInstalar', 'No pude abrir la instalación. Sigue los pasos de abajo.'); irALaGuia(); });
        } catch (x) { decir('msgInstalar', 'No pude abrir la instalación. Sigue los pasos de abajo.'); pestana('android', false); irALaGuia(); }
        return;
      }
      pestana(esiOS ? 'iphone' : 'android', false);
      decir('msgInstalar', esiOS ? 'En iPhone se hace desde el botón Compartir de Safari. Mira los pasos aquí abajo.' : 'Tu navegador no deja instalar con un solo toque. Sigue estos pasos:');
      irALaGuia();
    });
  }

  // ----- sin internet -----
  function red() { var a = $('sinRed'); if (a) a.hidden = nav.onLine !== false; }

  // ----- compartir -----
  function iniciarCompartir() {
    var b = $('btnCompartir'); if (!b) return;
    b.addEventListener('click', function () {
      var url = new URL('./', location.href).href;
      var datos = { title: 'Tierra Buena', text: 'Te comparto Tierra Buena: vivir lo que aprendemos, juntos.', url: url };
      if (nav.share) {
        nav.share(datos).then(function () { decir('msgCompartir', ''); }, function (e) { if (!e || e.name !== 'AbortError') decir('msgCompartir', 'No pude abrir «Compartir». El enlace es: ' + url); });
      } else if (nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(url).then(function () { decir('msgCompartir', 'Enlace copiado. Pégalo en un mensaje.'); }, function () { decir('msgCompartir', 'Copia este enlace: ' + url); });
      } else { decir('msgCompartir', 'Copia este enlace: ' + url); }
    });
  }

  iniciarPestanas(); iniciarInstalar(); iniciarCompartir(); red();
  window.addEventListener('online', red); window.addEventListener('offline', red);
  if ('serviceWorker' in nav) { window.addEventListener('load', function () { nav.serviceWorker.register('sw.js').catch(function () { /* sin copia sin internet, pero funciona igual */ }); }); }
})();
