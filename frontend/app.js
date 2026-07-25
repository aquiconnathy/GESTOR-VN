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
    ADMIN: ['dashboard', 'ventas', 'recepcion', 'instalaciones', 'despacho', 'config'],
    ASESOR: ['dashboard', 'ventas'],
    ALMACEN: ['dashboard', 'recepcion', 'despacho'],
    CONFIGURADOR: ['dashboard', 'config', 'instalaciones'],
    INSTALADOR: ['dashboard', 'instalaciones', 'despacho']
  };

  const allowedViews = permissions[rol] || ['dashboard', 'ventas'];
  
  // Mostrar/Ocultar botones del menú
  ['dashboard', 'ventas', 'recepcion', 'instalaciones', 'despacho', 'config'].forEach(v => {
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

  if (id === 'dashboard') cargarEstadisticasDashboard();
  if (id === 'instalaciones') cargarPendientes();
  if (id === 'ventas') cargarVentas();
}

// ================= DASHBOARD & TRAZABILIDAD =================
async function cargarEstadisticasDashboard() {
  try {
    const data = await apiGet('/dashboard/stats');
    if (data) {
      document.getElementById('statStock').textContent = data.stock_disponible || 0;
      document.getElementById('statVentas').textContent = data.total_ventas || 0;
      document.getElementById('statInstPend').textContent = data.instalaciones_pendientes || 0;
      
      const container = document.getElementById('stockModelosTable');
      if (container && data.desglose_modelos) {
        let html = '<table><thead><tr><th>Modelo de Equipo</th><th>Cantidad en Stock</th></tr></thead><tbody>';
        for (let [mod, cnt] of Object.entries(data.desglose_modelos)) {
          html += `<tr><td><b>${mod}</b></td><td><span class="badge enruta">${cnt}</span></td></tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
      }
    }
  } catch (e) {
    console.error('Error cargando stats dashboard:', e);
  }
}

async function ejecutarTrazabilidad() {
  const input = document.getElementById('traceSearchInput');
  const container = document.getElementById('traceResults');
  if (!input || !container) return;
  const q = input.value.trim();
  if (!q) return toast('Escribe un término de búsqueda (Serial, Cédula, Nombre...)', 'error');

  container.innerHTML = '<p style="color:var(--muted)">🔍 Rastreando en el historial...</p>';

  try {
    const data = await apiGet(`/dashboard/trazabilidad?query=${encodeURIComponent(q)}`);
    let html = '';

    const hasResults = (data.equipos && data.equipos.length) || 
                       (data.ventas && data.ventas.length) || 
                       (data.instalaciones && data.instalaciones.length) || 
                       (data.equipos_cliente && data.equipos_cliente.length);

    if (!hasResults) {
      container.innerHTML = '<p style="color:var(--muted)">No se encontraron coincidencias en el historial.</p>';
      return;
    }

    if (data.equipos && data.equipos.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">📦 Equipos Encontrados (${data.equipos.length})</h4><table><thead><tr><th>ID</th><th>Serial PON</th><th>Modelo</th><th>Estado</th><th>Recepción</th></tr></thead><tbody>`;
      data.equipos.forEach(e => {
        html += `<tr><td><b>${e.id}</b></td><td><code>${e.serial_pon}</code></td><td>${e.modelo}</td><td><span class="badge ${e.estado.toLowerCase()}">${e.estado}</span></td><td>${e.id_recepcion||'-'}</td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (data.ventas && data.ventas.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">🛒 Ventas Encontradas (${data.ventas.length})</h4><table><thead><tr><th>ID Venta</th><th>Cliente</th><th>Cédula/RIF</th><th>Asesor</th><th>Estado Inst.</th></tr></thead><tbody>`;
      data.ventas.forEach(v => {
        html += `<tr><td><b>${v.id_venta||'V_'+v.id}</b></td><td>${v.cliente}</td><td>${v.cedula_rif||'-'}</td><td>${v.asesor||'-'}</td><td><span class="badge ${(v.status_instalacion||'').toLowerCase()}">${v.status_instalacion||'-'}</span></td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (data.instalaciones && data.instalaciones.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">📋 Instalaciones (${data.instalaciones.length})</h4><table><thead><tr><th>ID</th><th>Cliente</th><th>Nodo</th><th>Serial ONU</th><th>PPPoE</th><th>Estado</th></tr></thead><tbody>`;
      data.instalaciones.forEach(i => {
        html += `<tr><td><b>${i.id}</b></td><td>${i.cliente}</td><td>${i.nodo||'-'}</td><td><code>${i.serial_onu||'-'}</code></td><td>${i.pppoe||'-'}</td><td><span class="badge ${i.status.toLowerCase()}">${i.status}</span></td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (data.equipos_cliente && data.equipos_cliente.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">🏠 Equipos Propios / EETL (${data.equipos_cliente.length})</h4><table><thead><tr><th>ID</th><th>Cliente</th><th>Serial PON</th><th>Modelo</th><th>Técnico</th></tr></thead><tbody>`;
      data.equipos_cliente.forEach(ec => {
        html += `<tr><td><b>${ec.id}</b></td><td>${ec.cliente}</td><td><code>${ec.serial_pon}</code></td><td>${ec.modelo||'-'}</td><td>${ec.instalador||'-'}</td></tr>`;
      });
      html += '</tbody></table>';
    }

    container.innerHTML = html;

  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger)">Error al consultar trazabilidad</p>';
  }
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
function calcularPppoePreviewVenta() {
  const ced = document.getElementById('vtaCedula').value.replace(/\D/g, '');
  const num = document.getElementById('vtaNumServicio') ? document.getElementById('vtaNumServicio').value || '1' : '1';
  const previewEl = document.getElementById('vtaPppoePreview');
  if (previewEl) {
    previewEl.value = ced ? `VN${ced}-${num}` : '';
  }
}

async function handleCrearVenta(e) {
  if (e) e.preventDefault();
  const nombre = document.getElementById('vtaNombre').value.trim();
  const tipoId = document.getElementById('vtaTipoId').value;
  const cedula = document.getElementById('vtaCedula').value.trim();
  const contacto = document.getElementById('vtaContacto').value.trim();
  const numServicio = document.getElementById('vtaNumServicio') ? document.getElementById('vtaNumServicio').value || '1' : '1';

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
    numero_servicio: numServicio,
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

// ================= CICLO DE VIDA (PENDIENTES, CONFIGURACIÓN, DESPACHO, CAMPO) =================
let instalacionesCache = [];

async function cargarPendientes() {
  try {
    const data = await apiGet('/instalaciones/pendientes');
    instalacionesCache = data || [];

    poblarSelectConfig();
    poblarDespachoConfigurados();
    poblarInstalacionesRuta();
  } catch (e) {
    console.error('Error cargando instalaciones:', e);
  }
}

// ---------- 1. CONFIGURACIÓN (Técnico Config) ----------
function poblarSelectConfig() {
  const selectEl = document.getElementById('cfgInstSelect');
  if (!selectEl) return;

  const pendientes = instalacionesCache.filter(i => (i.status || '').toUpperCase() === 'PENDIENTE_ASIGNAR' || (i.status || '').toUpperCase() === 'PENDIENTE');
  
  if (!pendientes.length) {
    selectEl.innerHTML = '<option value="">Sin instalaciones pendientes de asignar</option>';
    return;
  }

  let html = '<option value="">-- Selecciona una Instalación Pendiente --</option>';
  pendientes.forEach(i => {
    html += `<option value="${i.id}">${i.id} | ${i.nombre_cliente} (${i.promocion || 'Estándar'})</option>`;
  });
  selectEl.innerHTML = html;
}

function handleSelectInstalacionConfig(selectEl) {
  const id = selectEl.value;
  if (!id) return;
  const inst = instalacionesCache.find(i => i.id === id);
  if (!inst) return;

  document.getElementById('cfgId').value = inst.id;
  document.getElementById('cfgNombre').value = inst.nombre_cliente || '';
  document.getElementById('cfgCedula').value = inst.cedula_rif || '';
  document.getElementById('cfgContacto').value = inst.nro_contacto || '';
  document.getElementById('cfgNodo').value = inst.nodo || '';
  document.getElementById('cfgDireccion').value = inst.direccion_exacta || '';
  document.getElementById('cfgPlan').value = inst.plan_servicio || '';
  document.getElementById('cfgPromo').value = inst.promocion || '';

  document.getElementById('cfgSerial').value = inst.serial_onu || '';
  
  const cedDigits = (inst.cedula_rif || '').replace(/\D/g, '');
  const numServ = inst.numero_servicio || '1';
  const pppoeAuto = inst.pppoe || (cedDigits ? `VN${cedDigits}-${numServ}` : '');
  document.getElementById('cfgPppoe').value = pppoeAuto;

  document.getElementById('cfgModelo').value = inst.modelo || 'AX30-H';
  document.getElementById('cfgMarca').value = inst.marca || 'VSOL';
  document.getElementById('cfgCodigoFibra').value = inst.codigo_fibra || '';
  document.getElementById('cfgAdminUser').value = inst.credencial_admin_usuario || 'admin';
  document.getElementById('cfgAdminPass').value = inst.credencial_admin_clave || 'admin123';
  document.getElementById('cfgPor').value = currentUser ? currentUser.nombre : '';
}

async function handleGuardarConfig(e) {
  e.preventDefault();
  const id_inst = document.getElementById('cfgId').value;
  if (!id_inst) return toast('Selecciona una instalación de la lista', 'error');

  try {
    toast('Guardando configuración...', 'info');
    const res = await apiPost('/instalaciones/configurar', {
      id_instalacion: id_inst,
      nombre_cliente: document.getElementById('cfgNombre').value.trim(),
      cedula_rif: document.getElementById('cfgCedula').value.trim(),
      nro_contacto: document.getElementById('cfgContacto').value.trim(),
      direccion_exacta: document.getElementById('cfgDireccion').value.trim(),
      nodo: document.getElementById('cfgNodo').value.trim(),
      plan_servicio: document.getElementById('cfgPlan').value.trim(),
      promocion: document.getElementById('cfgPromo').value.trim(),
      serial_onu: document.getElementById('cfgSerial').value.trim().toUpperCase(),
      pppoe: document.getElementById('cfgPppoe').value.trim(),
      modelo: document.getElementById('cfgModelo').value.trim().toUpperCase(),
      marca: document.getElementById('cfgMarca').value.trim(),
      codigo_fibra: document.getElementById('cfgCodigoFibra').value.trim(),
      credencial_admin_usuario: document.getElementById('cfgAdminUser').value.trim(),
      credencial_admin_clave: document.getElementById('cfgAdminPass').value.trim(),
      configurado_por: document.getElementById('cfgPor').value.trim()
    });

    toast('✅ Equipo configurado con éxito (Pasa a CONFIGURADO)');
    cargarPendientes();
  } catch (err) {
    toast('Error en configuración: ' + err.message, 'error');
  }
}

// ---------- 2. DESPACHO DE CONFIGURADOS (Almacén / Logística) ----------
function poblarDespachoConfigurados(filtro = '') {
  const container = document.getElementById('listaConfiguradosDespacho');
  if (!container) return;

  let configurados = instalacionesCache.filter(i => (i.status || '').toUpperCase() === 'CONFIGURADO');
  
  if (filtro.trim()) {
    const f = filtro.toLowerCase();
    configurados = configurados.filter(i => 
      (i.id || '').toLowerCase().includes(f) ||
      (i.nombre_cliente || '').toLowerCase().includes(f) ||
      (i.serial_onu || '').toLowerCase().includes(f)
    );
  }

  if (!configurados.length) {
    container.innerHTML = '<p style="color:var(--muted)">Sin equipos configurados pendientes por despachar.</p>';
    return;
  }

  let html = '<table><thead><tr><th>Seleccionar</th><th>ID</th><th>Cliente</th><th>Nodo</th><th>Serial ONU</th><th>Modelo</th></tr></thead><tbody>';
  configurados.forEach(i => {
    html += `<tr>
      <td style="text-align:center"><input type="checkbox" class="chk-despacho" value="${i.id}" style="transform:scale(1.3)"></td>
      <td><b>${i.id}</b></td>
      <td>${i.nombre_cliente}</td>
      <td>${i.nodo || '-'}</td>
      <td><code>${i.serial_onu || '-'}</code></td>
      <td>${i.modelo || '-'}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function filtrarDespachoConfigurados() {
  const q = document.getElementById('despSearchInput').value;
  poblarDespachoConfigurados(q);
}

async function enviarDespachoSeleccionados() {
  const checkboxes = document.querySelectorAll('.chk-despacho:checked');
  const ids = Array.from(checkboxes).map(c => c.value);
  const instalador = document.getElementById('despInstalador').value.trim();

  if (!ids.length) return toast('Selecciona al menos un equipo configurado con el checkbox', 'error');
  if (!instalador) return toast('Escribe el nombre del técnico de campo asignado', 'error');

  try {
    toast('Despachando a ruta...', 'info');
    const res = await apiPost('/instalaciones/despachar', {
      id_instalaciones: ids,
      instalador: instalador
    });
    toast(`✅ ${res.message} (Pasan a EN_RUTA)`);
    document.getElementById('despInstalador').value = '';
    cargarPendientes();
  } catch (err) {
    toast('Error en despacho: ' + err.message, 'error');
  }
}

// ---------- 3. CAMPO / TÉCNICOS (Confirmación de Instalación) ----------
function poblarInstalacionesRuta(filtro = '') {
  const container = document.getElementById('listaInstalacionesRuta');
  if (!container) return;

  let enRuta = instalacionesCache.filter(i => (i.status || '').toUpperCase() === 'EN_RUTA');

  if (filtro.trim()) {
    const f = filtro.toLowerCase();
    enRuta = enRuta.filter(i => 
      (i.id || '').toLowerCase().includes(f) ||
      (i.nombre_cliente || '').toLowerCase().includes(f) ||
      (i.direccion_exacta || '').toLowerCase().includes(f) ||
      (i.serial_onu || '').toLowerCase().includes(f)
    );
  }

  if (!enRuta.length) {
    container.innerHTML = '<p style="color:var(--muted)">Sin instalaciones en ruta activas.</p>';
    return;
  }

  let html = '';
  enRuta.forEach(i => {
    const isEETL = (i.promocion || '').toUpperCase().includes('LUGAR') || (i.promocion || '').toUpperCase().includes('EETL');
    
    html += `
      <div style="background:#1e293b; padding:1rem; border-radius:.5rem; margin-bottom:1rem; border:1px solid ${isEETL ? '#f59e0b' : 'var(--accent)'}">
        <div style="display:flex; justify-content:space-between; align-items:center">
          <h3 style="margin:0; color:var(--text)">${i.id} | ${i.nombre_cliente}</h3>
          <span class="badge ${isEETL ? 'eetl' : 'enruta'}">${isEETL ? 'ESTE ES TU LUGAR (EETL)' : 'EN_RUTA'}</span>
        </div>
        <p style="font-size:.85rem; color:var(--muted); margin:.4rem 0">
          📍 <b>Nodo:</b> ${i.nodo || '-'} | 📞 <b>Contacto:</b> ${i.nro_contacto || '-'} | 🏠 <b>Dirección:</b> ${i.direccion_exacta || '-'}<br>
          ⚡ <b>Plan:</b> ${i.plan_servicio || '-'} | 🔌 <b>Serial:</b> <code>${i.serial_onu || '-'}</code> | 🌐 <b>PPPoE:</b> <code>${i.pppoe || '-'}</code>
        </p>`;

    if (isEETL) {
      html += `
        <div style="background:#0f172a; padding:.75rem; border-radius:.4rem; margin-top:.5rem">
          <span style="font-size:.8rem; color:#f59e0b; font-weight:700">📡 Datos del Equipo Propio (EETL):</span>
          <div class="grid-2" style="margin-top:.4rem">
            <input type="text" id="eetlSerial_${i.id}" placeholder="Serial PON Equipo Propio *" value="${i.serial_onu||''}">
            <input type="text" id="eetlModelo_${i.id}" placeholder="Modelo Equipo Propio *" value="${i.modelo||''}">
          </div>
          <div class="grid-2" style="margin-top:.4rem">
            <input type="text" id="eetlMarca_${i.id}" placeholder="Marca *" value="${i.marca||'VSOL'}">
            <input type="text" id="eetlFibra_${i.id}" placeholder="Código Fibra (Opcional)">
          </div>
          <button class="btn success" style="margin-top:.6rem; width:100%" onclick="confirmarEETLCampo('${i.id}')">📡 Confirmar Instalación EETL (Equipo Propio)</button>
        </div>`;
    } else {
      html += `<button class="btn success" style="margin-top:.6rem; width:100%" onclick="confirmarInstalacionCampo('${i.id}')">✅ Confirmar Instalación Completada</button>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

function filtrarInstalacionesRuta() {
  const q = document.getElementById('instSearchInput').value;
  poblarInstalacionesRuta(q);
}

async function confirmarInstalacionCampo(idInst) {
  try {
    toast('Confirmando instalación...', 'info');
    const res = await apiPost('/instalaciones/instalado', {
      id_instalacion: idInst,
      instalado_por: currentUser ? currentUser.nombre : 'Técnico Campo'
    });
    toast('✅ Instalación completada con éxito');
    cargarPendientes();
  } catch (err) {
    toast('Error al confirmar instalación: ' + err.message, 'error');
  }
}

async function confirmarEETLCampo(idInst) {
  const inst = instalacionesCache.find(i => i.id === idInst);
  const serial = document.getElementById(`eetlSerial_${idInst}`).value.trim();
  const modelo = document.getElementById(`eetlModelo_${idInst}`).value.trim();
  const marca = document.getElementById(`eetlMarca_${idInst}`).value.trim();
  const fibra = document.getElementById(`eetlFibra_${idInst}`).value.trim();

  if (!serial || !modelo) return toast('Escribe el serial PON y el modelo del equipo propio', 'error');

  try {
    toast('Procesando migración EETL...', 'info');
    const res = await apiPost('/instalaciones/eetl', {
      id_instalacion: idInst,
      serial_pon: serial.toUpperCase(),
      modelo: modelo.toUpperCase(),
      marca: marca || 'VSOL',
      codigo_fibra: fibra,
      nombre_cliente: inst ? inst.nombre_cliente : '',
      cedula_rif: inst ? inst.cedula_rif : '',
      nro_contacto: inst ? inst.nro_contacto : '',
      direccion: inst ? inst.direccion_exacta : '',
      plan: inst ? inst.plan_servicio : '',
      nodo: inst ? inst.nodo : '',
      instalado_por: currentUser ? currentUser.nombre : 'Técnico Campo'
    });
    toast('✅ Instalación EETL completada con éxito');
    cargarPendientes();
  } catch (err) {
    toast('Error en confirmación EETL: ' + err.message, 'error');
  }
}

// ================= SERVICE WORKER =================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
