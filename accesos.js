// accesos.js — Panel de accesos de pastores (privado). Viene de panel-accesos-pastor.html; sin código en línea, llave cifrada con PIN.

let sb = null;
let filas = [];

// ==BOVEDA==
// La llave (service_role) NUNCA se guarda en claro: se cifra con tu PIN (PBKDF2 + AES-GCM) y solo se abre en memoria.
const CLAVE_BOVEDA = 'tb_accesos_boveda';
let alCrearBoveda = null;
const aB64 = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
async function derivar(pin, sal, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function guardarBoveda(url, key, pin) {
  const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 250000;
  const k = await derivar(pin, sal, iter);
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify({ url, key }))));
  localStorage.setItem(CLAVE_BOVEDA, JSON.stringify({ v: 1, i: iter, s: aB64(sal), n: aB64(iv), c: aB64(c) }));
}
async function abrirBoveda(pin) {
  const b = JSON.parse(localStorage.getItem(CLAVE_BOVEDA));
  const k = await derivar(pin, deB64(b.s), b.i);
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(b.n) }, k, deB64(b.c));
  return JSON.parse(new TextDecoder().decode(p));
}
// ==/BOVEDA==

const $ = (id) => document.getElementById(id);

function mensaje(el, texto, tipo) {
  el.innerHTML = texto ? `<div class="msg ${tipo}">${texto}</div>` : '';
}

// --- Conexión ---

async function conectar(url, key, silencioso) {
  try {
    sb = supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'panel_pastor_admin_token' }
    });
    const { error } = await sb.from('pastores_acceso').select('id', { count: 'exact', head: true });
    if (error) throw error;
    if (alCrearBoveda) { await guardarBoveda(url, key, alCrearBoveda); alCrearBoveda = null; }
    $('panelConexion').style.display = 'none';
    $('panelPrincipal').style.display = 'block';
    cargarFilas();
    cargarSolicitudes();
    cargarRecuperaciones();
  } catch (e) {
    if (!silencioso) mensaje($('msgConexion'), 'No se pudo conectar. Revisa la URL y la clave (tiene que ser la service_role, no la anon).', 'error');
  }
}

$('btnConectar').addEventListener('click', () => {
  const url = $('inUrl').value.trim();
  const key = $('inKey').value.trim();
  const pin = $('inPinNuevo').value;
  if (!url || !key) { mensaje($('msgConexion'), 'Completa la dirección y la llave.', 'error'); return; }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) { mensaje($('msgConexion'), 'La dirección debe ser la de tu proyecto de Supabase (termina en .supabase.co).', 'error'); return; }
  if (pin.length < 6) { mensaje($('msgConexion'), 'Crea un PIN de al menos 6 caracteres: es el candado que protege esta llave en tu celular.', 'error'); return; }
  alCrearBoveda = pin;
  conectar(url, key, false);
});

$('btnDesconectar').addEventListener('click', () => {
  if (!confirm('¿Olvidar la llave guardada en este aparato? Tendrás que pegarla de nuevo y crear otro PIN.')) return;
  localStorage.removeItem(CLAVE_BOVEDA);
  location.reload();
});

// --- Correo profesional al solicitante ---
const FIRMA = 'Equipo Tierra Buena';   // <- cambia por tu nombre o el de tu equipo
const EMISOR = 'softappgms@outlook.com';   // F770: remitente FIJO de todos los correos de este panel
// Abre Outlook en la web con el mensaje ya escrito. (mailto: usa el programa de correo que tenga el computador y no deja elegir
// la cuenta; por eso se cambió.) Outlook envía desde la cuenta abierta en ese navegador: debe ser EMISOR.
function abrirOutlook(para, asunto, cuerpo) {
  const url = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(para)
    + '&subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  window.open(url, '_blank', 'noopener');
}
const AVISO_EMISOR = `<p class="muted" data-u="8">📤 Se envía desde <b>${EMISOR}</b> (Outlook en la web). Antes de enviar, mira arriba a la derecha de Outlook: debe ser esa cuenta.</p>`;
let nombres = {};                 // correo -> nombre (tomado de las solicitudes)
let cache = {};                   // id -> fila de pastores_acceso

function armarCorreo(f) {
  const nombre = nombres[(f.correo || '').toLowerCase()];
  const saludo = nombre ? `Estimado/a ${nombre}:` : 'Estimado/a pastor/a:';
  const para = f.iglesia ? ` para ${f.iglesia}` : '';
  const asunto = 'Tu código de acceso a las funciones de pastor — Tierra Buena';
  const cuerpo =
`${saludo}

Gracias por tu solicitud y por el servicio que prestas a tu comunidad. Hemos revisado tus datos y nos alegra confirmar tu acceso a las funciones de pastor en Tierra Buena${para}.

Tu código de acceso es:

    ${f.codigo}

Cómo activarlo:
1. Abre Tierra Buena y elige «Ya tengo mi código de pastor».
2. Escribe tu nombre, este mismo correo (${f.correo}), tu contraseña y el código.
   Si ya creaste una cuenta de miembro con este correo, entra a Mi perfil y activa el código desde ahí.

Ten presente:
• El código solo funciona con el correo al que lo enviamos (${f.correo}). Si usas otro, la app dirá que el código pertenece a otro correo.
• Es personal: no lo compartas. Si pasan 30 días sin usarlo, vence y te lo renovamos.
• Si necesitas activarlo en otro equipo, responde a este correo y lo habilitamos.
• Los datos que nos enviaste se usan únicamente para confirmar tu rol de pastor, con el fin de cuidar a la comunidad. Nunca se utilizan con fines personales ni comerciales.

Que Dios bendiga tu labor.

Con aprecio,
${FIRMA}`;
  return { asunto, cuerpo };
}

function enviarCorreo(id) {
  const f = cache[id]; if (!f) return;
  const { asunto, cuerpo } = armarCorreo(f);
  abrirOutlook(f.correo, asunto, cuerpo);
}

async function copiarMensaje(id, btn) {
  const f = cache[id]; if (!f) return;
  const { asunto, cuerpo } = armarCorreo(f);
  try {
    await navigator.clipboard.writeText(`Asunto: ${asunto}\n\n${cuerpo}`);
    if (btn) { const t = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = t, 1800); }
  } catch (e) { alert('No se pudo copiar automáticamente.'); }
}

function mostrarResultado(box, f) {
  cache[f.id] = f;
  box.innerHTML = `
    <div class="codigo-box">${f.codigo}</div><br>
    <button class="sm" data-a="enviarCorreo" data-a1="${f.id}">✉️ Enviar desde Outlook a ${escapeHtml(f.correo)}</button>
    <button class="ghost sm" data-a="copiarMensaje" data-a1="${f.id}" data-btn="1">📋 Copiar mensaje</button>
    <button class="ghost sm" data-a="copiarTexto" data-a1="${f.codigo}">Copiar solo el código</button>
    ${AVISO_EMISOR}`;
}

// --- Generar ---
$('btnGenerar').addEventListener('click', async () => {
  const correo = $('inCorreo').value.trim().toLowerCase();
  const iglesia = $('inIglesia').value.trim();
  const box = $('resultadoGenerar');
  if (!correo) { mensaje(box, 'Escribe el correo del pastor.', 'error'); return; }

  $('btnGenerar').disabled = true;
  const { data, error } = await sb.from('pastores_acceso').insert({ correo, iglesia: iglesia || null }).select().single();
  $('btnGenerar').disabled = false;

  if (error) {
    if (error.code === '23505') {
      mensaje(box, 'Ya existe un acceso para ese correo. Búscalo en la lista de abajo.', 'error');
    } else {
      mensaje(box, 'No se pudo generar: ' + error.message, 'error');
    }
    return;
  }

  mostrarResultado(box, data);
  $('inCorreo').value = ''; $('inIglesia').value = '';
  cargarFilas();
});

// --- Listado ---
async function cargarFilas() {
  const { data, error } = await sb.from('pastores_acceso').select('*').order('creado_en', { ascending: false });
  if (error) { $('tablaWrap').innerHTML = '<p class="empty">No se pudo cargar la lista.</p>'; return; }
  filas = data || [];
  filas.forEach(f => cache[f.id] = f);
  const { data: sol } = await sb.from('pastores_solicitudes').select('correo,nombre');
  (sol || []).forEach(x => nombres[(x.correo || '').toLowerCase()] = x.nombre);
  pintarTabla();
}

const DIAS_VIGENCIA = 30;   // igual que pastor_validar_codigo_v2 en Supabase
function estaVencido(f) {
  const ref = f.ultima_actividad || f.usado_en || f.creado_en;
  return !!ref && (Date.now() - new Date(ref).getTime()) > DIAS_VIGENCIA * 86400000;
}
function estadoDe(f) {
  if (f.revocado) return { txt: 'Revocado', cls: 'revocado' };
  if (estaVencido(f)) return { txt: 'Vencido', cls: 'vencido' };
  if (f.usado_en) return { txt: 'Activado', cls: 'activado' };
  return { txt: 'Pendiente', cls: 'pendiente' };
}

function pintarTabla() {
  const q = $('inBuscar').value.trim().toLowerCase();
  const lista = filas.filter(f => !q || (f.correo || '').toLowerCase().includes(q) || (f.iglesia || '').toLowerCase().includes(q));

  if (!lista.length) { $('tablaWrap').innerHTML = '<p class="empty">Sin resultados.</p>'; return; }

  $('tablaWrap').innerHTML = `
    <table>
      <thead><tr><th>Correo</th><th>Iglesia</th><th>Código</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${lista.map(f => {
          const e = estadoDe(f);
          return `<tr data-id="${f.id}">
            <td>${escapeHtml(f.correo)}</td>
            <td><input class="iglesia-edit" value="${escapeAttr(f.iglesia || '')}" data-id="${f.id}" placeholder="—"></td>
            <td class="codigo-cell">${f.codigo}
              <button class="ghost sm" data-a="copiarTexto" data-a1="${f.codigo}">📋</button>
            </td>
            <td><span class="estado ${e.cls}">${e.txt}</span></td>
            <td class="acciones">
              ${f.revocado ? '' : `<button class="sm" data-a="enviarCorreo" data-a1="${f.id}">✉️ Enviar correo</button>
              <button class="ghost sm" data-a="copiarMensaje" data-a1="${f.id}" data-btn="1">📋 Mensaje</button>`}
              ${f.revocado
                ? `<button class="ghost sm" data-a="reactivar" data-a1="${f.id}">Reactivar</button>`
                : `<button class="ghost sm" data-a="revocar" data-a1="${f.id}">Revocar</button>`}
              ${f.usado_en && !f.revocado ? `<button class="ghost sm" data-a="reiniciar" data-a1="${f.id}">Permitir reactivar en otro dispositivo</button>` : ''}
              ${!f.revocado && (!f.usado_en || estaVencido(f)) ? `<button class="ghost sm" data-a="activarForzado" data-a1="${f.id}" title="Lo marca como activado y renueva su plazo de 30 días">⚡ Activar a la fuerza</button>` : ''}
              ${!f.revocado ? `<button class="ghost sm" data-a="cambiarCorreo" data-a1="${f.id}" title="Si la persona se registra con otro correo, cámbialo aquí">✏️ Cambiar correo</button>` : ''}
              <button class="danger sm" data-a="eliminar" data-a1="${f.id}">Eliminar</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  document.querySelectorAll('.iglesia-edit').forEach(inp => {
    inp.addEventListener('change', async () => {
      await sb.from('pastores_acceso').update({ iglesia: inp.value.trim() || null }).eq('id', inp.dataset.id);
    });
  });
}

// F780: «Activar a la fuerza» — marca el código como activado y renueva su plazo (sirve si quedó «Pendiente» o «Vencido»).
// No crea la cuenta en el equipo de la persona: ella igual debe registrarse con el MISMO correo del código.
async function activarForzado(id) {
  const f = cache[id]; if (!f) return;
  if (!confirm('Esto marca el código de ' + f.correo + ' como ACTIVADO y renueva su plazo de ' + DIAS_VIGENCIA + ' días.\n\nLa persona igual debe crear su cuenta en la app con ese mismo correo. ¿Continuar?')) return;
  const ahora = new Date().toISOString();
  const { error } = await sb.from('pastores_acceso').update({ usado_en: f.usado_en || ahora, ultima_actividad: ahora }).eq('id', id);
  if (error) { alert('No se pudo activar: ' + error.message); return; }
  cargarFilas();
}
// F780: «Cambiar correo» — la causa de «Ese código pertenece a otro correo» es que el correo de la cuenta no es el del código.
async function cambiarCorreo(id) {
  const f = cache[id]; if (!f) return;
  const nuevo = (prompt('Correo con el que la persona va a crear su cuenta (hoy: ' + f.correo + '):', f.correo) || '').trim().toLowerCase();
  if (!nuevo || nuevo === (f.correo || '').toLowerCase()) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) { alert('Ese correo no parece válido.'); return; }
  const { error } = await sb.from('pastores_acceso').update({ correo: nuevo }).eq('id', id);
  if (error) {
    alert(error.code === '23505' ? 'Ya existe un acceso para ese correo. Búscalo en la lista.' : 'No se pudo cambiar: ' + error.message);
    return;
  }
  cargarFilas();
}
async function revocar(id) { await sb.from('pastores_acceso').update({ revocado: true }).eq('id', id); cargarFilas(); }
async function reactivar(id) { await sb.from('pastores_acceso').update({ revocado: false }).eq('id', id); cargarFilas(); }
async function reiniciar(id) {
  if (!confirm('Esto permite que el mismo código se vuelva a activar (por ejemplo si el pastor cambió de computadora). ¿Continuar?')) return;
  await sb.from('pastores_acceso').update({ usado_en: null }).eq('id', id); cargarFilas();
}
async function eliminar(id) {
  if (!confirm('Esto borra el acceso por completo. ¿Seguro?')) return;
  await sb.from('pastores_acceso').delete().eq('id', id); cargarFilas();
}

// --- Solicitudes pendientes (formulario público) ---
async function cargarSolicitudes() {
  const web = await sb.from('pastores_solicitudes').select('*').eq('procesada', false).order('enviado_en', { ascending: true });
  if (web.error) { $('solicitudesWrap').innerHTML = '<p class="empty">No se pudo cargar. Revisa la conexión y toca «Refrescar».</p>'; return; }
  // Las que se envían desde la app del celular viven en otra tabla (solicitudes_pastor): se muestran juntas.
  const cel = await sb.from('solicitudes_pastor').select('*').eq('estado', 'pendiente').order('creado_en', { ascending: true });
  const delCel = (cel.data || []).map(r => ({ id: r.id, nombre: r.nombre, correo: r.correo, iglesia: r.iglesia, ciudad: '', verificacion: 'Origen: app del celular (pidió pocos datos: confírmalo tú antes de aprobar)', comprobante: r.mensaje || '(sin comentario)', enviado_en: r.creado_en, _origen: 'cel' }));
  const lista = (web.data || []).map(r => Object.assign({ _origen: 'web' }, r)).concat(delCel).sort((a, b) => new Date(a.enviado_en) - new Date(b.enviado_en));
  const n = $('contadorSol'); if (n) n.textContent = lista.length ? String(lista.length) : '';
  pintarSolicitudes(lista);
}
async function cerrarSolicitud(id, origen, aprobada) {
  if (origen === 'cel') return sb.from('solicitudes_pastor').update({ estado: aprobada ? 'aprobada' : 'rechazada', resuelto_en: new Date().toISOString() }).eq('id', id);
  return sb.from('pastores_solicitudes').update({ procesada: true }).eq('id', id);
}
function pedirMasDatos(correo, nombre) {
  const cuerpo = 'Hola ' + (nombre || '') + ',\n\nGracias por pedir tu acceso de pastor en Tierra Buena. Para proteger a las personas de tu iglesia confirmamos a cada pastor antes de entregar el código.\n\nPara terminar la revisión, ¿puedes responder este correo con lo siguiente?\n\n- El enlace público de tu iglesia (web, Facebook, Instagram o YouTube)\n- El nombre y el teléfono o correo de otro pastor o líder que te conozca\n- Un teléfono o WhatsApp donde podamos hablar contigo\n\nCon esos datos lo resolvemos rápido. Si prefieres no hacerlo, puedes seguir usando Tierra Buena con tu cuenta básica.\n\nGracias por tu paciencia y por tu servicio.\nTierra Buena';
  abrirOutlook(correo, 'Tu acceso de pastor en Tierra Buena: necesitamos un dato más', cuerpo);
}
function responderNoAprobada(correo, nombre) {
  const cuerpo = 'Hola ' + (nombre || '') + ',\n\nGracias por tu interés en el acceso de pastor de Tierra Buena. Por ahora no pudimos confirmar los datos de tu solicitud, así que no podemos entregar el código todavía. Esto no es un juicio sobre ti: lo hacemos igual con todas las solicitudes para cuidar a las personas de cada iglesia.\n\nSi quieres, puedes volver a escribirnos con más datos (un enlace público de tu iglesia o un pastor que te conozca). Mientras tanto puedes usar la app con tu cuenta básica.\n\nQue Dios te bendiga.\nTierra Buena';
  abrirOutlook(correo, 'Sobre tu acceso de pastor en Tierra Buena', cuerpo);
}

function pintarSolicitudes(lista) {
  if (!lista.length) { $('solicitudesWrap').innerHTML = '<p class="empty">No hay solicitudes pendientes.</p>'; return; }
  $('solicitudesWrap').innerHTML = lista.map(s => `
    <div class="solicitud" data-id="${s.id}">
      <div class="solicitud-top">
        <span class="solicitud-nombre">${escapeHtml(s.nombre)} <small class="muted">· ${s._origen === 'cel' ? '📱 desde el celular' : '🌐 desde la web'}</small></span>
        <span class="solicitud-fecha">${new Date(s.enviado_en).toLocaleDateString()}</span>
      </div>
      <dl>
        <dt>Correo</dt><dd>${escapeHtml(s.correo)}</dd>
        <dt>Iglesia</dt><dd>${escapeHtml(s.iglesia)}${s.ciudad ? ' — ' + escapeHtml(s.ciudad) : ''}</dd>
        ${s.verificacion ? `<dt>Datos para verificar</dt><dd data-u="9">${escapeHtml(s.verificacion)}</dd>` : ''}
        <dt>Comprobante</dt><dd data-u="9">${escapeHtml(s.comprobante)}</dd>
      </dl>
      <div data-u="10">
        <p class="muted" data-u="11"><b>Antes de aprobar, compruébalo tú</b> (busca los datos por tu cuenta; no te fíes solo de lo que escribió la persona). Marca al menos 2:</p>
        <label data-u="12"><input type="checkbox" data-vchk="${s.id}"> El enlace público (web, Facebook, YouTube…) muestra a esta persona como pastor de esa iglesia.</label>
        <label data-u="12"><input type="checkbox" data-vchk="${s.id}"> Hablé o escribí a la referencia (otro pastor o líder) y lo confirmó.</label>
        <label data-u="12"><input type="checkbox" data-vchk="${s.id}"> Hablé con la persona (llamada o videollamada) y conoce bien su iglesia y su denominación.</label>
      </div>
      <div class="acciones">
        <button class="sm" id="apr-${s.id}" disabled title="Marca al menos 2 comprobaciones" data-a="aprobarSolicitud" data-a1="${s.id}" data-a2="${escapeAttr(s.correo)}" data-a3="${escapeAttr(s.iglesia)}" data-a4="${s._origen}">✅ Generar código y aprobar</button>
        <button class="ghost sm" data-a="pedirMasDatos" data-a1="${escapeAttr(s.correo)}" data-a2="${escapeAttr(s.nombre)}">✉️ Pedir más datos</button>
        <button class="ghost sm" data-a="descartarSolicitud" data-a1="${s.id}" data-a2="${s._origen}" data-a3="${escapeAttr(s.correo)}" data-a4="${escapeAttr(s.nombre)}">Descartar</button>
      </div>
    </div>`).join('');
  // El botón de aprobar se enciende solo con 2 o más comprobaciones marcadas.
  document.querySelectorAll('[data-vchk]').forEach(c => c.addEventListener('change', () => {
    const id = c.dataset.vchk;
    const n = document.querySelectorAll('[data-vchk="' + id + '"]:checked').length;
    const b = document.getElementById('apr-' + id); if (b) b.disabled = n < 2;
  }));
}

async function aprobarSolicitud(id, correo, iglesia, origen) {
  const { data, error } = await sb.from('pastores_acceso').insert({ correo, iglesia }).select().single();
  if (error) {
    if (error.code === '23505') {
      alert('Ya existe un acceso para ese correo. Búscalo en la lista de más abajo.');
    } else {
      alert('No se pudo generar el código: ' + error.message);
    }
    return;
  }
  await cerrarSolicitud(id, origen, true);

  const nom = (await sb.from(origen === 'cel' ? 'solicitudes_pastor' : 'pastores_solicitudes').select('nombre').eq('id', id).single()).data?.nombre;
  if (nom) nombres[correo.toLowerCase()] = nom;
  mostrarResultado($('resultadoAprobacion'), data);
  cargarSolicitudes();
  cargarFilas();
}

async function descartarSolicitud(id, origen, correo, nombre) {
  if (!confirm('¿Descartar esta solicitud sin generar código?')) return;
  await cerrarSolicitud(id, origen, false);
  cargarSolicitudes();
  if (correo && confirm('¿Quieres avisarle a la persona con un correo amable ya escrito?')) responderNoAprobada(correo, nombre);
}

$('btnRefrescarSolicitudes').addEventListener('click', cargarSolicitudes);
$('btnRefrescar').addEventListener('click', cargarFilas);


$('inBuscar').addEventListener('input', pintarTabla);

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }

// --- Recuperación de claves (F769) ---
let cacheRec = {};   // id -> fila de recuperaciones
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin 0/O/1/I para que no se confunda al leerlo
function nuevoCodigoRec() {
  const b = new Uint32Array(8); crypto.getRandomValues(b);
  return Array.from(b, n => ALFABETO[n % ALFABETO.length]).join('');
}
function verCodigo(c) { return c ? c.slice(0, 4) + '-' + c.slice(4) : ''; }
function armarCorreoRec(f) {
  const saludo = f.nombre ? `Hola ${f.nombre}:` : 'Hola:';
  const asunto = 'Tu código para recuperar tu contraseña — Tierra Buena';
  const cuerpo =
`${saludo}

Recibimos tu petición para recuperar tu contraseña de Tierra Buena. Este es tu código:

    ${verCodigo(f.codigo)}

Cómo usarlo:
1. Abre Tierra Buena y toca «¿Olvidaste tu contraseña?».
2. Escribe tu correo y toca «Ya tengo mi código».
3. Escribe el código y elige tu contraseña nueva.

Ten presente:
• El código sirve por 24 horas y una sola vez.
• Si tú no pediste esto, puedes ignorar este mensaje: tu contraseña no cambia.

Con aprecio,
${FIRMA}`;
  return { asunto, cuerpo };
}
function enviarCorreoRec(id) {
  const f = cacheRec[id]; if (!f) return;
  const { asunto, cuerpo } = armarCorreoRec(f);
  abrirOutlook(f.correo, asunto, cuerpo);
}
async function copiarMensajeRec(id, btn) {
  const f = cacheRec[id]; if (!f) return;
  const { asunto, cuerpo } = armarCorreoRec(f);
  try {
    await navigator.clipboard.writeText(`Asunto: ${asunto}\n\n${cuerpo}`);
    if (btn) { const t = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = t, 1800); }
  } catch (e) { alert('No se pudo copiar automáticamente.'); }
}
function mostrarResultadoRec(f) {
  cacheRec[f.id] = f;
  $('resultadoRecup').innerHTML = `
    <div class="codigo-box">${verCodigo(f.codigo)}</div>
    <p class="muted" data-u="13">Para ${escapeHtml(f.nombre || '')} &lt;${escapeHtml(f.correo)}&gt; · vence ${new Date(f.vence_en).toLocaleString()}</p>
    <button class="sm" data-a="enviarCorreoRec" data-a1="${f.id}">✉️ Enviar desde Outlook a ${escapeHtml(f.correo)}</button>
    <button class="ghost sm" data-a="copiarMensajeRec" data-a1="${f.id}" data-btn="1">📋 Copiar mensaje</button>
    <button class="ghost sm" data-a="copiarTexto" data-a1="${f.codigo}">Copiar solo el código</button>
    ${AVISO_EMISOR}`;
  $('resultadoRecup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function cargarRecuperaciones() {
  const { data, error } = await sb.from('recuperaciones').select('*').in('estado', ['pendiente', 'con_codigo']).order('creado_en', { ascending: true });
  if (error) { $('recupWrap').innerHTML = '<p class="empty">No se pudo cargar (' + escapeHtml(error.message) + '). ¿Ya corriste el SQL de recuperaciones en Supabase?</p>'; return; }
  pintarRecuperaciones(data || []);
}
function pintarRecuperaciones(lista) {
  lista.forEach(f => { cacheRec[f.id] = f; });
  if (!lista.length) { $('recupWrap').innerHTML = '<p class="empty">No hay peticiones de recuperación pendientes.</p>'; return; }
  $('recupWrap').innerHTML = lista.map(f => {
    const vigente = f.estado === 'con_codigo' && f.vence_en && new Date(f.vence_en) > new Date();
    const estado = f.estado === 'pendiente' ? '⏳ Esperando tu código'
      : vigente ? `✅ Código generado · vence ${new Date(f.vence_en).toLocaleString()}` : '⌛ Código vencido';
    const acciones = f.estado === 'pendiente' || !vigente
      ? `<button class="sm" data-a="generarCodigoRec" data-a1="${f.id}">🔑 Generar código (24 h)</button>`
      : `<button class="sm" data-a="verResultadoRec" data-a1="${f.id}">👁 Ver código y enviar</button>
         <button class="ghost sm" data-a="generarOtroRec" data-a1="${f.id}">Generar otro</button>`;
    return `
    <div class="solicitud">
      <div class="solicitud-top">
        <span class="solicitud-nombre">${escapeHtml(f.nombre || '(sin nombre)')}</span>
        <span class="solicitud-fecha">${new Date(f.creado_en).toLocaleString()}</span>
      </div>
      <dl><dt>Correo</dt><dd>${escapeHtml(f.correo)}</dd><dt>Estado</dt><dd>${estado}</dd></dl>
      <div class="acciones">${acciones}
        <button class="ghost sm" data-a="descartarRecup" data-a1="${f.id}">Descartar</button>
      </div>
    </div>`;
  }).join('');
}
async function generarCodigoRec(id, otro) {
  if (otro && !confirm('El código anterior dejará de servir. ¿Generar uno nuevo?')) return;
  const codigo = nuevoCodigoRec();
  const vence_en = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb.from('recuperaciones').update({ codigo, vence_en, estado: 'con_codigo', intentos: 0 }).eq('id', id).select().single();
  if (error) { alert('No se pudo generar el código: ' + error.message); return; }
  mostrarResultadoRec(data);
  cargarRecuperaciones();
}
async function descartarRecup(id) {
  if (!confirm('¿Descartar esta petición? La persona tendrá que pedir otra.')) return;
  await sb.from('recuperaciones').update({ estado: 'descartada' }).eq('id', id);
  $('resultadoRecup').innerHTML = '';
  cargarRecuperaciones();
}
$('btnRefrescarRecup').addEventListener('click', cargarRecuperaciones);

// --- Acciones de los botones (sin código en línea: la política de seguridad no lo permite) ---
function copiarTexto(t) { navigator.clipboard.writeText(t).catch(() => alert('No se pudo copiar automáticamente.')); }
function verResultadoRec(id) { mostrarResultadoRec(cacheRec[id]); }
function generarOtroRec(id) { return generarCodigoRec(id, true); }
const ACCIONES = { activarForzado, aprobarSolicitud, cambiarCorreo, copiarMensaje, copiarMensajeRec, copiarTexto, descartarRecup, descartarSolicitud, eliminar, enviarCorreo, enviarCorreoRec, generarCodigoRec, generarOtroRec, pedirMasDatos, reactivar, reiniciar, revocar, verResultadoRec };
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const f = ACCIONES[b.dataset.a]; if (!f) return;
  const d = b.dataset; const a = [d.a1, d.a2, d.a3, d.a4].filter((x) => x !== undefined);
  if (d.btn) a.splice(1, 0, b);
  f.apply(null, a);
});

// --- Candado: PIN al abrir, y se vuelve a cerrar solo si sales de la app más de 2 minutos ---
let fallosPin = 0, ocultoDesde = 0;
$('btnDesbloquear').addEventListener('click', async () => {
  const box = $('msgBloqueo'), btn = $('btnDesbloquear');
  if (!$('inPin').value) { mensaje(box, 'Escribe tu PIN.', 'error'); return; }
  btn.disabled = true; let datos = null;
  try { datos = await abrirBoveda($('inPin').value); } catch (e) { /* PIN incorrecto */ }
  $('inPin').value = '';
  if (!datos) {
    fallosPin++;
    if (fallosPin >= 5) { mensaje(box, 'PIN incorrecto muchas veces. Espera 30 segundos.', 'error'); setTimeout(() => { fallosPin = 0; btn.disabled = false; mensaje(box, '', ''); }, 30000); return; }
    btn.disabled = false; mensaje(box, 'PIN incorrecto.', 'error'); return;
  }
  fallosPin = 0; btn.disabled = false; mensaje(box, '', '');
  $('panelBloqueo').style.display = 'none';
  await conectar(datos.url, datos.key, true);
  if ($('panelPrincipal').style.display !== 'block') { $('panelBloqueo').style.display = 'block'; mensaje(box, 'El PIN es correcto, pero no pude conectar con Supabase. Revisa tu internet e inténtalo otra vez.', 'error'); }
});
$('inPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnDesbloquear').click(); });
$('btnBloquear').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ocultoDesde = Date.now(); return; }
  if (ocultoDesde && Date.now() - ocultoDesde > 120000 && $('panelPrincipal').style.display === 'block') location.reload();
});

try { localStorage.removeItem('panel_pastor_cred'); } catch (e) { /* versión antigua: llave en claro, se borra */ }
if (localStorage.getItem(CLAVE_BOVEDA)) { $('panelConexion').style.display = 'none'; $('panelBloqueo').style.display = 'block'; $('inPin').focus(); }
else { $('inUrl').value = 'https://mxgvaspztajgzxfgtxfq.supabase.co'; }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
