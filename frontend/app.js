// ================= CONFIGURACIÓN =================
const API_URL = 'https://gestor-vn-production.up.railway.app';
let html5QrCode = null;
let scanned = [];
let currentUser = null;
let ventasCache = [];

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

// ================= AUTENTICACIÓN =================
function checkAuth() {
  const stored = localStorage.getItem('umsr_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
      document.getElementById('userName').textContent = currentUser.nombre;
      document.getElementById('userRole').textContent = currentUser.rol;
      
      if (document.getElementById('vtaAsesor')) {
        document.getElementById('vtaAsesor').value = currentUser.nombre;
      }
      applyRolePermissions();
      return;
    } catch (e) {
      localStorage.removeItem('umsr_user');
    }
  }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) return toast('Ingresa correo y contraseña', 'error');

  try {
    const data = await apiPost('/auth/login', { email, password });
    currentUser = data;
    localStorage.setItem('umsr_user', JSON.stringify(currentUser));
    toast(`Bienvenido ${data.nombre}`);
    checkAuth();
  } catch (err) {
    toast('Error de autenticación: ' + (err.message || 'Credenciales incorrectas'), 'error');
  }
}

function quickLogin(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
  handleLogin();
}

function handleLogout() {
  localStorage.removeItem('umsr_user');
  currentUser = null;
  toast('Sesión cerrada');
  checkAuth();
}

function applyRolePermissions() {
  if (!currentUser) return;
  const rol = currentUser.rol;
  
  // Mapa de visibilidad de pestañas según ROL
  const permissions = {
    ADMIN: ['ventas', 'recepcion', 'instalaciones', 'despacho', 'config'],
    ASESOR: ['ventas'],
    ALMACEN: ['recepcion', 'despacho'],
    CONFIGURADOR: ['config', 'instalaciones'],
    INSTALADOR: ['instalaciones', 'despacho']
  };

  const allowedViews = permissions[rol] || ['ventas'];
  
  // Mostrar/Ocultar botones del menú
  ['ventas', 'recepcion', 'instalaciones', 'despacho', 'config'].forEach(v => {
    const btn = document.getElementById('nav-' + v);
    if (btn) {
      btn.style.display = allowedViews.includes(v) ? 'inline-block' : 'none';
    }
  });

  // Activar primera pestaña disponible
  const firstAllowed = allowedViews[0];
  if (firstAllowed) showView(firstAllowed);
}

// ================= NAVEGACIÓN =================
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  
  const targetView = document.getElementById('view-' + id);
  if (targetView) targetView.classList.add('active');
  
  const targetNav = document.getElementById('nav-' + id);
  if (targetNav) targetNav.classList.add('active');

  if (id === 'instalaciones') cargarPendientes();
  if (id === 'ventas') cargarVentas();
}

// ================= TOAST =================
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.borderColor = type === 'error' ? '#ef4444' : '#3b82f6';
  setTimeout(() => t.style.display = 'none', 3500);
}

// ================= OFFLINE DETECT =================
window.addEventListener('online', () => {
  document.getElementById('offlineBanner').style.display = 'none';
  syncPending();
});
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').style.display = 'block';
});

// ================= API HELPERS =================
async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.token) {
    headers['Authorization'] = `Bearer ${currentUser.token}`;
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.message || 'Error en servidor');
    return data;
  } catch (e) {
    if (path !== '/auth/login') queueOperation({ path, body });
    throw e;
  }
}

async function apiGet(path) {
  const headers = {};
  if (currentUser && currentUser.token) {
    headers['Authorization'] = `Bearer ${currentUser.token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { headers });
  return res.json();
}

// ================= OFFLINE QUEUE =================
function queueOperation(op) {
  let q = JSON.parse(localStorage.getItem('umsr_queue') || '[]');
  q.push(op);
  localStorage.setItem('umsr_queue', JSON.stringify(q));
  toast('Sin conexión: Operación guardada en cola offline', 'info');
}

async function syncPending() {
  let q = JSON.parse(localStorage.getItem('umsr_queue') || '[]');
  if (!q.length) return;
  for (let op of q) {
    try {
      await apiPost(op.path, op.body);
    } catch (e) {}
  }
  localStorage.removeItem('umsr_queue');
  toast('Sincronización offline completada');
}

// ================= VENTAS =================
async function handleCrearVenta(e) {
  if (e) e.preventDefault();
  const nombre = document.getElementById('vtaNombre').value.trim();
  const tipoId = document.getElementById('vtaTipoId').value;
  const cedula = document.getElementById('vtaCedula').value.trim();
  const contacto = document.getElementById('vtaContacto').value.trim();

  if (!nombre || !cedula || !contacto) {
    return toast('Nombre, Cédula y Contacto son obligatorios', 'error');
  }

  const payload = {
    nombre_cliente: nombre,
    tipo_id: tipoId,
    cedula_rif: `${tipoId}-${cedula}`,
    nro_contacto: contacto,
    correo_electronico: document.getElementById('vtaCorreo').value.trim(),
    direccion_exacta: document.getElementById('vtaDireccion').value.trim(),
    nodo: document.getElementById('vtaNodo').value,
    plan_servicio: document.getElementById('vtaPlan').value,
    promocion: document.getElementById('vtaPromo').value,
    asesor_venta: currentUser ? currentUser.nombre : 'PWA App',
    observaciones: document.getElementById('vtaObs').value.trim()
  };

  try {
    const res = await apiPost('/ventas/crear', payload);
    toast(`✅ Venta ${res.id_venta} registrada exitosamente`);
    // Limpiar formulario
    document.getElementById('vtaNombre').value = '';
    document.getElementById('vtaCedula').value = '';
    document.getElementById('vtaContacto').value = '';
    document.getElementById('vtaCorreo').value = '';
    document.getElementById('vtaDireccion').value = '';
    document.getElementById('vtaObs').value = '';
    cargarVentas();
  } catch (err) {
    toast('Error registrando venta: ' + err.message, 'error');
  }
}

async function cargarVentas() {
  const container = document.getElementById('listaVentas');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted)">Cargando ventas...</p>';
  try {
    ventasCache = await apiGet('/ventas/listar');
    renderTablaVentas(ventasCache);
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger)">Error al cargar historial de ventas</p>';
  }
}

function renderTablaVentas(ventas) {
  const container = document.getElementById('listaVentas');
  if (!ventas || !ventas.length) {
    container.innerHTML = '<p style="color:var(--muted)">No hay ventas registradas.</p>';
    return;
  }
  let html = `<table>
    <thead>
      <tr>
        <th>ID Venta</th>
        <th>Cliente</th>
        <th>Cédula/RIF</th>
        <th>Plan</th>
        <th>Nodo</th>
        <th>Estado Instalación</th>
      </tr>
    </thead>
    <tbody>`;
  ventas.forEach(v => {
    const badgeClass = (v.status_instalacion || 'PENDIENTE_ASIGNAR').toLowerCase().replace('_', '');
    html += `<tr>
      <td><b>${v.id_venta || 'V_'+v.id}</b></td>
      <td>${v.nombre_cliente}</td>
      <td>${v.cedula_rif || '-'}</td>
      <td>${v.plan_servicio || '-'}</td>
      <td>${v.nodo || '-'}</td>
      <td><span class="badge ${badgeClass}">${v.status_instalacion || 'PENDIENTE'}</span></td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function filtrarVentas() {
  const q = document.getElementById('vtaSearch').value.toLowerCase().trim();
  if (!q) return renderTablaVentas(ventasCache);
  const filtradas = ventasCache.filter(v => 
    (v.nombre_cliente && v.nombre_cliente.toLowerCase().includes(q)) ||
    (v.cedula_rif && v.cedula_rif.toLowerCase().includes(q)) ||
    (v.id_venta && v.id_venta.toLowerCase().includes(q))
  );
  renderTablaVentas(filtradas);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

function setScanStatus(msg, isError = false) {
  const el = document.getElementById('scanStatus');
  if (el) {
    el.textContent = msg;
    el.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  }
}

function getModeloActivo() {
  const sel = document.getElementById('recModeloSelect');
  if (!sel) return 'AX30-H';
  if (sel.value === '__NEW__') {
    const input = document.getElementById('recNuevoModeloInput');
    return input && input.value.trim() ? input.value.trim().toUpperCase() : 'NUEVO_MODELO';
  }
  return sel.value;
}

function handleModeloChange(selectEl) {
  const box = document.getElementById('boxNuevoModelo');
  if (!box) return;
  if (selectEl.value === '__NEW__') {
    box.style.display = 'block';
    const input = document.getElementById('recNuevoModeloInput');
    if (input) input.focus();
  } else {
    box.style.display = 'none';
  }
}

function processBarcodeResult(decodedText) {
  if (!decodedText) return;
  
  let raw = decodedText.trim()
    .replace(/^(SN|S\/N|PON S\/N|PON|MAC):\s*/i, '')
    .replace(/[\r\n\t\s]/g, '')
    .toUpperCase();

  if (/^[A-Z0-9\-\_]{4,32}$/.test(raw)) {
    const serial = raw;
    if (!scanned.includes(serial)) {
      scanned.push(serial);
      playBeep();
      const listEl = document.getElementById('scannedList');
      const modelo = getModeloActivo();
      const newLine = `${serial},${modelo}`;
      listEl.value = listEl.value.trim() ? listEl.value.trim() + '\n' + newLine : newLine;
      actualizarConteoLista();
      setScanStatus('✅ Agregado: ' + serial + ' (' + modelo + ')');
      toast('✅ Serial detectado: ' + serial);
    }
  }
}

function handleFastInput(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    agregarSerialManual();
  }
}

function agregarSerialManual() {
  const input = document.getElementById('fastSerialInput');
  if (!input) return;
  let val = input.value.trim()
    .replace(/^(SN|S\/N|PON S\/N|PON|MAC):\s*/i, '')
    .replace(/[\r\n\t\s]/g, '')
    .toUpperCase();
    
  if (!val) return;

  if (!scanned.includes(val)) {
    scanned.push(val);
    playBeep();
    const listEl = document.getElementById('scannedList');
    const modelo = getModeloActivo();
    const newLine = `${val},${modelo}`;
    listEl.value = listEl.value.trim() ? listEl.value.trim() + '\n' + newLine : newLine;
    actualizarConteoLista();
    toast(`⚡ Agregado: ${val} (${modelo})`);
  } else {
    toast('⚠️ Serial ya está en la lista', 'error');
  }
  input.value = '';
  input.focus();
}

function actualizarConteoLista() {
  const raw = document.getElementById('scannedList').value.trim();
  if (!raw) {
    document.getElementById('scanCount').textContent = '0';
    scanned = [];
    return;
  }
  const lines = raw.split('\n').map(l => l.split(',')[0].trim()).filter(Boolean);
  scanned = [...new Set(lines)];
  document.getElementById('scanCount').textContent = scanned.length;
}

// ================= CÁMARA =================
function toggleScanner() {
  const reader = document.getElementById('reader');
  if (!reader) return;
  
  if (reader.style.display === 'block') {
    reader.style.display = 'none';
    if (html5QrCode) {
      html5QrCode.stop().then(() => { html5QrCode = null; }).catch(() => { html5QrCode = null; });
    }
    return;
  }

  reader.style.display = 'block';
  setScanStatus('Solicitando acceso a la cámara...');

  if (typeof Html5Qrcode === 'undefined') {
    setScanStatus('⚠️ Librería de cámara no disponible', true);
    return;
  }

  try {
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 15, qrbox: { width: 280, height: 100 } },
      processBarcodeResult,
      () => {}
    ).then(() => {
      setScanStatus('📷 Cámara activa - Apunta al código');
    }).catch(err => {
      setScanStatus('❌ Error al abrir cámara: ' + (err.message || err), true);
      html5QrCode = null;
    });
  } catch (err) {
    setScanStatus('❌ Error: ' + err.message, true);
    html5QrCode = null;
  }
}

// ================= RECEPCIÓN =================
async function enviarRecepcion() {
  const raw = document.getElementById('scannedList').value.trim();
  if (!raw) return toast('Ingresa o escanea al menos un serial', 'error');
  
  const equipos = raw.split('\n').map(line => {
    const parts = line.split(',');
    const serial = parts[0] ? parts[0].trim().toUpperCase() : '';
    const modelo = parts[1] ? parts[1].trim().toUpperCase() : 'AX30-H';
    return { serial_pon: serial, modelo: modelo || 'AX30-H' };
  }).filter(e => e.serial_pon);

  if (!equipos.length) return toast('Sin seriales válidos', 'error');

  try {
    toast('Guardando recepción...', 'info');
    const data = await apiPost('/equipos/recepcion', {
      equipos,
      entrega: document.getElementById('recEntrega').value.trim(),
      recibe: document.getElementById('recRecibe').value.trim(),
      observaciones: document.getElementById('recObs').value.trim()
    });
    toast(`✅ Recepción ${data.id || ''} guardada (${data.cantidad || equipos.length} equipos)`);
    scanned = [];
    document.getElementById('scannedList').value = '';
    actualizarConteoLista();
  } catch (e) {
    toast('Error guardando recepción: ' + (e.message || e), 'error');
  }
}

// ================= PENDIENTES =================
async function cargarPendientes() {
  const container = document.getElementById('listaPendientes');
  container.innerHTML = '<p style="color:var(--muted)">Cargando instalaciones...</p>';
  try {
    const data = await apiGet('/instalaciones/pendientes');
    if (!data || !data.length) { container.innerHTML = '<p style="color:var(--muted)">Sin pendientes</p>'; return; }
    let html = '<table><thead><tr><th>ID</th><th>Cliente</th><th>Nodo</th><th>Plan</th><th>Status</th></tr></thead><tbody>';
    data.forEach(i => {
      const badge = (i.status || 'PENDIENTE').toLowerCase().replace('_','');
      html += `<tr><td><b>${i.id}</b></td><td>${i.nombre_cliente}</td><td>${i.nodo||'-'}</td><td>${i.plan_servicio||'-'}</td><td><span class="badge ${badge}">${i.status}</span></td></tr>`;
    });
    html += 'tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--danger)">Error cargando instalaciones</p>';
  }
}

// ================= DESPACHO =================
async function enviarDespacho() {
  const ids = document.getElementById('despIds').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return toast('Ingresa al menos un ID', 'error');
  try {
    const data = await apiPost('/instalaciones/despachar', {
      id_instalaciones: ids,
      instalador: document.getElementById('despInstalador').value || 'Técnico'
    });
    toast(data.message);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ================= CONFIGURAR =================
async function enviarConfig() {
  try {
    const data = await apiPost('/instalaciones/configurar', {
      id_instalacion: document.getElementById('cfgId').value,
      serial_onu: document.getElementById('cfgSerial').value,
      pppoe: document.getElementById('cfgPppoe').value,
      modelo: document.getElementById('cfgModelo').value,
      configurado_por: document.getElementById('cfgPor').value
    });
    toast(data.message);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ================= INSTALADO =================
async function marcarInstalado() {
  try {
    const data = await apiPost('/instalaciones/instalado', {
      id_instalacion: document.getElementById('instId').value,
      instalado_por: currentUser ? currentUser.nombre : 'Técnico'
    });
    toast(data.message);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ================= SERVICE WORKER =================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
