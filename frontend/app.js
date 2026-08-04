const API_URL = (typeof window !== 'undefined' && window.ENV && window.ENV.API_URL)
  || (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL))
  || 'https://gestor-vn-production.up.railway.app';
let html5QrCode = null;
let scanned = [];
let currentUser = null;
let ventasCache = [];

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedTheme();
  checkAuth();
});

// ================= TEMA CLARO / OSCURO =================
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('umsr_theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
}

function loadSavedTheme() {
  const theme = localStorage.getItem('umsr_theme');
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    const btn = document.getElementById('btnTheme');
    if (btn) btn.textContent = '☀️';
  }
}

function renderLogoUI(logoUrl) {
  const img = document.getElementById('appLogoImg');
  const text = document.getElementById('appLogoText');
  const urlInput = document.getElementById('adminLogoUrl');

  // Si tienes una URL cargada, la muestra; si no, fuerza el uso de tu imagen local 'logo.png'
  const activeLogo = logoUrl ? logoUrl : 'logo.png';

  if (img) {
    img.src = activeLogo;
    img.style.display = 'inline-block'; // Forzamos que siempre esté visible
  }
  
  // Opcional: si quieres ocultar el texto "GESTOR-VN" cuando hay logo, déjalo; 
  // si quieres que aparezcan ambos, comenta o borra la línea que oculta el texto.
}

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
      cargarConfiguracionSistemaAdmin();
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

function applyRolePermissions(rol, switchTab = false) {
  if (!rol) return;
  
  // Mapa de visibilidad de pestañas según ROL
  const permissions = {
    ADMIN: ['dashboard', 'ventas', 'recepcion', 'inventario', 'instalaciones', 'despacho', 'config', 'evaluacion', 'admin-config'],
    ASESOR: ['dashboard', 'ventas', 'inventario'],
    ALMACEN: ['dashboard', 'recepcion', 'inventario', 'despacho', 'evaluacion'],
    CONFIGURADOR: ['dashboard', 'config', 'inventario', 'instalaciones', 'evaluacion'],
    INSTALADOR: ['dashboard', 'instalaciones', 'inventario', 'despacho']
  };

  const allowedViews = permissions[rol] || ['dashboard', 'ventas', 'inventario'];
  
  // Reordenar botones en el DOM según el orden guardado
  const navContainer = document.getElementById('mainNav');
  const savedOrder = adminSettingsCache.menu_orden || ['dashboard', 'ventas', 'recepcion', 'inventario', 'instalaciones', 'despacho', 'config', 'evaluacion', 'admin-config'];
  
  if (navContainer) {
    savedOrder.forEach(v => {
      const btn = document.getElementById('nav-' + v);
      if (btn) {
        btn.style.display = allowedViews.includes(v) ? 'flex' : 'none';
        navContainer.appendChild(btn); // Re-anexa en el orden deseado
      }
    });
  }

  // Solo cambiar de pestaña si switchTab es true (ej: al hacer Login)
  if (switchTab) {
    const firstAllowed = savedOrder.find(v => allowedViews.includes(v)) || allowedViews[0];
    if (firstAllowed) showView(firstAllowed);
  }
}

// ================= SIDEBAR DESPLEGABLE =================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;

  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

// ================= NAVEGACIÓN =================
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  
  const targetView = document.getElementById('view-' + id);
  if (targetView) targetView.classList.add('active');
  
  const targetNav = document.getElementById('nav-' + id);
  if (targetNav) targetNav.classList.add('active');

  // Cerrar menú en móviles al hacer clic en un item
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }

  if (id === 'dashboard') cargarEstadisticasDashboard();
  if (id === 'inventario') cargarInventario();
  if (id === 'instalaciones') cargarPendientes();
  if (id === 'ventas') cargarVentas();
  if (id === 'evaluacion') cargarEquiposEvaluacion();
  if (id === 'admin-config') cargarConfiguracionSistemaAdmin();
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
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">📦 Equipos Encontrados (${data.equipos.length})</h4><table><thead><tr><th>ID</th><th>Serial PON</th><th>Modelo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
      data.equipos.forEach(e => {
        html += `<tr><td><b>${e.id}</b></td><td><code>${e.serial_pon}</code></td><td>${e.modelo}</td><td><span class="badge ${e.estado.toLowerCase()}">${e.estado}</span></td><td><button class="btn danger" style="padding:.2rem .5rem; font-size:.75rem" onclick="eliminarEquipo('${e.id}')">🗑️ Borrar</button></td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (data.ventas && data.ventas.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">🛒 Ventas Encontradas (${data.ventas.length})</h4><table><thead><tr><th>ID Venta</th><th>Cliente</th><th>Cédula/RIF</th><th>Asesor</th><th>Acción</th></tr></thead><tbody>`;
      data.ventas.forEach(v => {
        html += `<tr><td><b>${v.id_venta||'V_'+v.id}</b></td><td>${v.cliente}</td><td>${v.cedula_rif||'-'}</td><td>${v.asesor||'-'}</td><td><button class="btn danger" style="padding:.2rem .5rem; font-size:.75rem" onclick="eliminarVenta('${v.id_venta||v.id}')">🗑️ Borrar</button></td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (data.instalaciones && data.instalaciones.length) {
      html += `<h4 style="color:var(--accent); margin:1rem 0 .4rem 0">📋 Instalaciones (${data.instalaciones.length})</h4><table><thead><tr><th>ID</th><th>Cliente</th><th>Nodo</th><th>Serial ONU</th><th>Acción</th></tr></thead><tbody>`;
      data.instalaciones.forEach(i => {
        html += `<tr><td><b>${i.id}</b></td><td>${i.cliente}</td><td>${i.nodo||'-'}</td><td><code>${i.serial_onu||'-'}</code></td><td><button class="btn danger" style="padding:.2rem .5rem; font-size:.75rem" onclick="eliminarInstalacion('${i.id}')">🗑️ Borrar</button></td></tr>`;
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

    // Historial de Auditoría y Transiciones de Estado
    try {
      const auditEvents = await apiGet(`/dashboard/auditoria?query=${encodeURIComponent(q)}`);
      if (auditEvents && auditEvents.length) {
        html += `<h4 style="color:#8b5cf6; margin:1.2rem 0 .4rem 0">📜 Historial de Auditoría & Transiciones (${auditEvents.length})</h4><table><thead><tr><th>Entidad</th><th>ID</th><th>Acción</th><th>Estado Anterior</th><th>Estado Nuevo</th><th>Usuario</th><th>Fecha</th></tr></thead><tbody>`;
        auditEvents.forEach(a => {
          html += `<tr>
            <td><span class="badge" style="background:#334155">${a.entidad}</span></td>
            <td><b>${a.entidad_id}</b></td>
            <td><b>${a.accion}</b></td>
            <td>${a.estado_anterior || '-'}</td>
            <td><span class="badge enruta">${a.estado_nuevo || '-'}</span></td>
            <td>${a.usuario || 'Sistema'}</td>
            <td>${a.created_at ? a.created_at.replace('T', ' ').substring(0, 16) : '-'}</td>
          </tr>`;
        });
        html += '</tbody></table>';
      }
    } catch (e) {
      console.error('Error cargando auditoria en trazabilidad:', e);
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

async function apiDelete(path) {
  const headers = {};
  if (currentUser && currentUser.token) {
    headers['Authorization'] = `Bearer ${currentUser.token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || 'Error al eliminar');
  return data;
}

async function eliminarVenta(idVenta) {
  if (!confirm(`¿Seguro que deseas eliminar la venta ${idVenta}?`)) return;
  try {
    const res = await apiDelete(`/ventas/${idVenta}`);
    toast('✅ Venta eliminada con éxito');
    cargarVentas();
  } catch (err) {
    toast('Error eliminando venta: ' + err.message, 'error');
  }
}

async function eliminarEquipo(idEquipo) {
  if (!confirm(`¿Seguro que deseas eliminar el equipo ${idEquipo}?`)) return;
  try {
    const res = await apiDelete(`/equipos/${idEquipo}`);
    toast('✅ Equipo eliminado con éxito');
    cargarEstadisticasDashboard();
  } catch (err) {
    toast('Error eliminando equipo: ' + err.message, 'error');
  }
}

async function eliminarInstalacion(idInstalacion) {
  if (!confirm(`¿Seguro que deseas eliminar la instalación ${idInstalacion}?`)) return;
  try {
    const res = await apiDelete(`/instalaciones/${idInstalacion}`);
    toast('✅ Instalación eliminada con éxito');
    cargarPendientes();
  } catch (err) {
    toast('Error eliminando instalación: ' + err.message, 'error');
  }
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
        <th>Acción</th>
      </tr>
    </thead>
    <tbody>`;
  ventas.forEach(v => {
    const badgeClass = (v.status_instalacion || 'PENDIENTE_ASIGNAR').toLowerCase().replace('_', '');
    const idVta = v.id_venta || v.id;
    html += `<tr>
      <td><b>${v.id_venta || 'V_'+v.id}</b></td>
      <td>${v.nombre_cliente}</td>
      <td>${v.cedula_rif || '-'}</td>
      <td>${v.plan_servicio || '-'}</td>
      <td>${v.nodo || '-'}</td>
      <td><span class="badge ${badgeClass}">${v.status_instalacion || 'PENDIENTE'}</span></td>
      <td><button class="btn danger" style="padding:.2rem .5rem; font-size:.75rem" onclick="eliminarVenta('${idVta}')">🗑️ Borrar</button></td>
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
  
  let raw = decodedText.trim();
  
  // Extraer el serial VSOL directamente si está presente en el texto decodificado
  const vsolMatch = raw.match(/(VSOL[A-Z0-9]{4,24})/i);
  if (vsolMatch && vsolMatch[1]) {
    raw = vsolMatch[1].toUpperCase();
  } else {
    raw = raw
      .replace(/^(SN|S\/N|PON\s*S\/N|PON|MAC|GPON|FSN|DEV):\s*/i, '')
      .replace(/[\r\n\t\s]/g, '')
      .toUpperCase();
  }

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
  let val = input.value.trim();
  
  const vsolMatch = val.match(/(VSOL[A-Z0-9]{4,24})/i);
  if (vsolMatch && vsolMatch[1]) {
    val = vsolMatch[1].toUpperCase();
  } else {
    val = val
      .replace(/^(SN|S\/N|PON\s*S\/N|PON|MAC|GPON|FSN|DEV):\s*/i, '')
      .replace(/[\r\n\t\s]/g, '')
      .toUpperCase();
  }
    
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

// ================= CÁMARA Y ESCÁNER 1D/2D =================
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
    const config = {
      fps: 25,
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.floor(Math.min(viewfinderWidth * 0.85, 320)),
        height: Math.floor(Math.min(viewfinderHeight * 0.5, 180))
      }),
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      config.formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX
      ];
    }

    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      processBarcodeResult,
      () => {}
    ).then(() => {
      setScanStatus('📷 Cámara activa - Apunta al código de barras VSOL');
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
    cargarInventario();
    cargarEstadisticasDashboard();
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
  document.getElementById('cfgCorreo').value = inst.correo_electronico || '';
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

function descargarBackupDirecto(idInstalacion) {
  window.open(`${API_URL}/instalaciones/${idInstalacion}/backup`, '_blank');
}

async function handleGuardarConfig(e) {
  e.preventDefault();
  const id_inst = document.getElementById('cfgId').value;
  const pppoeVal = document.getElementById('cfgPppoe').value.trim();
  if (!id_inst) return toast('Selecciona una instalación de la lista', 'error');

  try {
    toast('Guardando configuración...', 'info');
    const res = await apiPost('/instalaciones/configurar', {
      id_instalacion: id_inst,
      nombre_cliente: document.getElementById('cfgNombre').value.trim(),
      cedula_rif: document.getElementById('cfgCedula').value.trim(),
      nro_contacto: document.getElementById('cfgContacto').value.trim(),
      correo_electronico: document.getElementById('cfgCorreo').value.trim(),
      direccion_exacta: document.getElementById('cfgDireccion').value.trim(),
      nodo: document.getElementById('cfgNodo').value.trim(),
      plan_servicio: document.getElementById('cfgPlan').value.trim(),
      promocion: document.getElementById('cfgPromo').value.trim(),
      serial_onu: document.getElementById('cfgSerial').value.trim().toUpperCase(),
      pppoe: pppoeVal,
      modelo: document.getElementById('cfgModelo').value.trim().toUpperCase(),
      marca: document.getElementById('cfgMarca').value.trim(),
      codigo_fibra: document.getElementById('cfgCodigoFibra').value.trim(),
      credencial_admin_usuario: document.getElementById('cfgAdminUser').value.trim(),
      credencial_admin_clave: document.getElementById('cfgAdminPass').value.trim(),
      configurado_por: document.getElementById('cfgPor').value.trim()
    });

    toast('✅ Equipo configurado con éxito');

    const box = document.getElementById('boxDescargarBackup');
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `
        <div style="background:#0284c7; padding:.9rem; border-radius:.5rem; text-align:center">
          <h4 style="margin:0 0 .4rem 0; color:#fff">✅ Configuración Guardada con Éxito</h4>
          <p style="font-size:.85rem; color:#e0f2fe; margin-bottom:.7rem">PPPoE asignado: <b>${pppoeVal}</b></p>
          <button type="button" class="btn success" style="width:auto; padding:.5rem 1.2rem; margin:0; font-size:.95rem" onclick="descargarBackupDirecto('${id_inst}')">📥 Descargar Backup XML Personalizado</button>
        </div>
      `;
    }

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

// ================= EVALUACIÓN & TALLER TÉCNICO =================
async function handleIngresarEvaluacion(e) {
  e.preventDefault();
  const serial = document.getElementById('evSerial').value.trim();
  const modelo = document.getElementById('evModelo').value.trim();
  const motivo = document.getElementById('evMotivo').value;
  const cliente = document.getElementById('evCliente').value.trim();
  const obs = document.getElementById('evObs').value.trim();

  if (!serial || !modelo) return toast('Serial y Modelo son obligatorios', 'error');

  try {
    toast('Registrando ingreso a evaluación...', 'info');
    const res = await apiPost('/evaluacion/ingresar', {
      serial_pon: serial.toUpperCase(),
      modelo: modelo.toUpperCase(),
      motivo: motivo,
      nombre_cliente: cliente,
      observaciones: obs,
      tecnico: currentUser ? currentUser.nombre : 'Técnico Taller'
    });
    toast(`✅ ${res.message}`);
    document.getElementById('evSerial').value = '';
    document.getElementById('evObs').value = '';
    cargarEquiposEvaluacion();
  } catch (err) {
    toast('Error ingresando equipo: ' + err.message, 'error');
  }
}

async function cargarEquiposEvaluacion() {
  const container = document.getElementById('listaEquiposEvaluacion');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted)">Cargando laboratorio...</p>';

  try {
    const data = await apiGet('/evaluacion/listar');
    if (!data || !data.length) {
      container.innerHTML = '<p style="color:var(--muted)">Sin equipos actualmente en evaluación o taller.</p>';
      return;
    }

    let html = '<table><thead><tr><th>Serial PON</th><th>Modelo</th><th>Estado / Motivo</th><th>Observaciones</th><th>Dictamen Técnico</th></tr></thead><tbody>';
    data.forEach(e => {
      html += `<tr>
        <td><b><code>${e.serial_pon}</code></b></td>
        <td>${e.modelo}</td>
        <td><span class="badge enruta">${e.estado}</span></td>
        <td>${e.observaciones || '-'}</td>
        <td>
          <div style="display:flex; gap:.3rem">
            <button type="button" class="btn success" style="padding:.2rem .5rem; font-size:.75rem; width:auto; margin:0" onclick="dictamenEvaluacion('${e.serial_pon}', 'REINTEGRO_INVENTARIO')">🔄 Reintegrar Stock</button>
            <button type="button" class="btn danger" style="padding:.2rem .5rem; font-size:.75rem; width:auto; margin:0" onclick="dictamenEvaluacion('${e.serial_pon}', 'DESCARTE')">🗑️ Descarte</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger)">Error al cargar equipos de evaluación</p>';
  }
}

async function dictamenEvaluacion(serial, opcion) {
  const nota = prompt(`Dictamen para el equipo ${serial} (${opcion}):\nEscribe notas del diagnóstico:`, 'Evaluación completada con éxito');
  if (nota === null) return;

  try {
    toast('Aplicando dictamen...', 'info');
    const res = await apiPost('/evaluacion/dictamen', {
      serial_pon: serial,
      dictamen: opcion,
      observaciones: nota
    });
    toast(`✅ ${res.message}`);
    cargarEquiposEvaluacion();
    cargarEstadisticasDashboard();
  } catch (err) {
    toast('Error en dictamen: ' + err.message, 'error');
  }
}

// ================= PANEL CONFIGURACIÓN GENERAL ADMIN =================
let adminSettingsCache = {
  nodos: ["NODO CENTRO", "NODO NORTE", "NODO SUR", "NODO ESTE", "NODO OESTE"],
  planes: ["100M FIBRA", "200M FIBRA", "500M FIBRA", "1GB FIBRA"],
  promociones: [
    { nombre: "PR_OCTUBRE", pasa_por_config: true },
    { nombre: "ESTE ES TU LUGAR", pasa_por_config: true },
    { nombre: "PROMO_PLANES", pasa_por_config: true }
  ],
  metodos_pago: ["PAGO MÓVIL", "ZELLE", "TRANSFERENCIA BANCARIA", "EFECTIVO USD", "USDT BINANCE"],
  modelos_equipos: ["AX30-H", "V2801S-B", "AC1200", "WK-3801"]
};

function actualizarFormulariosConConfigAdmin() {
  if (!adminSettingsCache) return;

  // 1. Nodos en vtaNodo
  const vtaNodoSelect = document.getElementById('vtaNodo');
  if (vtaNodoSelect && Array.isArray(adminSettingsCache.nodos)) {
    const currentVal = vtaNodoSelect.value;
    let html = '';
    adminSettingsCache.nodos.forEach(n => {
      const val = typeof n === 'string' ? n : (n.nombre || n.val || n);
      html += `<option value="${val}">${val}</option>`;
    });
    vtaNodoSelect.innerHTML = html || '<option value="">Sin nodos</option>';
    if (currentVal && adminSettingsCache.nodos.includes(currentVal)) {
      vtaNodoSelect.value = currentVal;
    }
  }

  // 2. Planes en vtaPlan
  const vtaPlanSelect = document.getElementById('vtaPlan');
  if (vtaPlanSelect && Array.isArray(adminSettingsCache.planes)) {
    const currentVal = vtaPlanSelect.value;
    let html = '';
    adminSettingsCache.planes.forEach(p => {
      const val = typeof p === 'string' ? p : (p.nombre || p.val || p);
      html += `<option value="${val}">${val}</option>`;
    });
    vtaPlanSelect.innerHTML = html || '<option value="">Sin planes</option>';
    if (currentVal && adminSettingsCache.planes.includes(currentVal)) {
      vtaPlanSelect.value = currentVal;
    }
  }

  // 3. Promociones en vtaPromo
  const vtaPromoSelect = document.getElementById('vtaPromo');
  if (vtaPromoSelect && Array.isArray(adminSettingsCache.promociones)) {
    const currentVal = vtaPromoSelect.value;
    let html = '';
    adminSettingsCache.promociones.forEach(p => {
      const pNom = typeof p === 'string' ? p : p.nombre;
      html += `<option value="${pNom}">${pNom}</option>`;
    });
    vtaPromoSelect.innerHTML = html || '<option value="">Sin promociones</option>';
    if (currentVal) {
      vtaPromoSelect.value = currentVal;
    }
  }

  // 4. Modelos de Equipos en recModeloSelect
  const recModeloSelect = document.getElementById('recModeloSelect');
  if (recModeloSelect && Array.isArray(adminSettingsCache.modelos_equipos)) {
    const currentVal = recModeloSelect.value;
    let html = '<option value="">-- Seleccionar Modelo --</option>';
    adminSettingsCache.modelos_equipos.forEach(m => {
      const val = typeof m === 'string' ? m : (m.nombre || m.val || m);
      html += `<option value="${val}">${val}</option>`;
    });
    recModeloSelect.innerHTML = html;
    if (currentVal) recModeloSelect.value = currentVal;
  }
}

async function apiPut(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.token) {
    headers['Authorization'] = `Bearer ${currentUser.token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || 'Error en servidor');
  return data;
}

async function cargarConfiguracionSistemaAdmin() {
  try {
    const data = await apiGet('/admin/settings');
    if (data) adminSettingsCache = data;
    renderAdminSettingsUI();
    renderLogoUI(adminSettingsCache.logo_url);
    cargarUsuariosAdmin();
  } catch (e) {
    console.error('Error cargando admin settings:', e);
    renderAdminSettingsUI();
    cargarUsuariosAdmin();
  }
}

async function aplicarLogoAdmin() {
  const url = document.getElementById('adminLogoUrl').value.trim();
  adminSettingsCache.logo_url = url;
  renderLogoUI(url);
  await guardarConfiguracionSistemaAdmin();
  toast('✅ Logo del sistema actualizado');
}

const ALL_TABS_MAP = {
  dashboard: '📊 Dashboard',
  ventas: '🛒 Ventas',
  recepcion: '📥 Recepción',
  instalaciones: '📋 Instalaciones',
  despacho: '🚚 Despacho',
  config: '⚙️ Configurar',
  evaluacion: '🧪 Evaluación',
  'admin-config': '⚙️ Config Admin'
};

let dragSourceIdxMenu = null;

function handleDragStartMenu(e, idx) {
  dragSourceIdxMenu = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.4';
}

function handleDragOverMenu(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDropMenu(e, targetIdx) {
  if (e.stopPropagation) e.stopPropagation();
  if (dragSourceIdxMenu !== null && dragSourceIdxMenu !== targetIdx) {
    if (!adminSettingsCache.menu_orden) {
      adminSettingsCache.menu_orden = ['dashboard', 'ventas', 'recepcion', 'instalaciones', 'despacho', 'config', 'evaluacion', 'admin-config'];
    }
    const movedItem = adminSettingsCache.menu_orden.splice(dragSourceIdxMenu, 1)[0];
    adminSettingsCache.menu_orden.splice(targetIdx, 0, movedItem);
    renderMenuOrdenUI();
  }
  return false;
}

function handleDragEndMenu(e) {
  e.currentTarget.style.opacity = '1';
  dragSourceIdxMenu = null;
}

function renderMenuOrdenUI() {
  const containerMenu = document.getElementById('adminListaMenuOrden');
  if (!containerMenu) return;
  let html = '';
  const tabs = adminSettingsCache.menu_orden || ['dashboard', 'ventas', 'recepcion', 'instalaciones', 'despacho', 'config', 'evaluacion', 'admin-config'];
  tabs.forEach((tabId, idx) => {
    const label = ALL_TABS_MAP[tabId] || tabId;
    html += `<div draggable="true" 
                  ondragstart="handleDragStartMenu(event, ${idx})" 
                  ondragover="handleDragOverMenu(event)" 
                  ondrop="handleDropMenu(event, ${idx})" 
                  ondragend="handleDragEndMenu(event)"
                  style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:.5rem .8rem; border-radius:.4rem; border:1px solid #334155; cursor:grab; user-select:none">
      <span style="display:flex; align-items:center; gap:.5rem">
        <span style="color:var(--muted); font-size:1.1rem">☰</span>
        <b>${label}</b>
      </span>
      <div style="display:flex; gap:.3rem; align-items:center">
        <button type="button" class="btn" style="padding:.15rem .4rem; font-size:.75rem; width:auto; margin:0; background:#334155" onclick="moverPestanaMenu(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
        <button type="button" class="btn" style="padding:.15rem .4rem; font-size:.75rem; width:auto; margin:0; background:#334155" onclick="moverPestanaMenu(${idx}, 1)" ${idx === tabs.length - 1 ? 'disabled' : ''}>⬇️</button>
      </div>
    </div>`;
  });
  containerMenu.innerHTML = html;
}

function renderAdminSettingsUI() {
  renderMenuOrdenUI();

  // Planes UI
  const containerPlanes = document.getElementById('adminListaPlanes');
  if (containerPlanes) {
    let html = '';
    (adminSettingsCache.planes || []).forEach((pl, idx) => {
      html += `<span class="badge" style="background:#065f46; font-size:.85rem; padding:.3rem .6rem">${pl} <b style="cursor:pointer; color:#ef4444; margin-left:.4rem" onclick="eliminarPlanAdmin(${idx})">×</b></span>`;
    });
    containerPlanes.innerHTML = html || '<p style="color:var(--muted)">Sin planes configurados</p>';
  }

  const containerNodos = document.getElementById('adminListaNodos');
  if (containerNodos) {
    let html = '';
    (adminSettingsCache.nodos || []).forEach((n, idx) => {
      html += `<span class="badge" style="background:#334155; font-size:.85rem; padding:.3rem .6rem">${n} <b style="cursor:pointer; color:#ef4444; margin-left:.4rem" onclick="eliminarNodoAdmin(${idx})">×</b></span>`;
    });
    containerNodos.innerHTML = html || '<p style="color:var(--muted)">Sin nodos configurados</p>';
  }

  const containerPromos = document.getElementById('adminListaPromos');
  if (containerPromos) {
    let html = '';
    (adminSettingsCache.promociones || []).forEach((p, idx) => {
      const pNom = typeof p === 'string' ? p : p.nombre;
      const pReq = typeof p === 'string' ? true : p.pasa_por_config;
      html += `<div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:.4rem .8rem; border-radius:.4rem">
        <span><b>${pNom}</b> ${pReq ? '<span class="badge enruta">Pasa por Config</span>' : '<span class="badge eetl">Directo a Campo</span>'}</span>
        <button type="button" class="btn danger" style="padding:.2rem .5rem; font-size:.75rem; width:auto; margin:0" onclick="eliminarPromoAdmin(${idx})">Eliminar</button>
      </div>`;
    });
    containerPromos.innerHTML = html || '<p style="color:var(--muted)">Sin promociones configuradas</p>';
  }

  const containerPagos = document.getElementById('adminListaMetodosPago');
  if (containerPagos) {
    let html = '';
    (adminSettingsCache.metodos_pago || []).forEach((m, idx) => {
      html += `<span class="badge" style="background:#065f46; font-size:.85rem; padding:.3rem .6rem">${m} <b style="cursor:pointer; color:#ef4444; margin-left:.4rem" onclick="eliminarMetodoPagoAdmin(${idx})">×</b></span>`;
    });
    containerPagos.innerHTML = html || '<p style="color:var(--muted)">Sin métodos de pago configurados</p>';
  }

  // Sincronizar selectores de todos los formularios de la app
  actualizarFormulariosConConfigAdmin();
}

function moverPestanaMenu(idx, dir) {
  if (!adminSettingsCache.menu_orden) {
    adminSettingsCache.menu_orden = ['dashboard', 'ventas', 'recepcion', 'instalaciones', 'despacho', 'config', 'evaluacion', 'admin-config'];
  }
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= adminSettingsCache.menu_orden.length) return;
  const temp = adminSettingsCache.menu_orden[idx];
  adminSettingsCache.menu_orden[idx] = adminSettingsCache.menu_orden[targetIdx];
  adminSettingsCache.menu_orden[targetIdx] = temp;
  renderMenuOrdenUI(); // Solo actualiza el borrador local sin redirigir de pantalla!
}

function agregarPlanAdmin() {
  const val = document.getElementById('adminNuevoPlan').value.trim().toUpperCase();
  if (!val) return;
  if (!adminSettingsCache.planes) adminSettingsCache.planes = [];
  if (!adminSettingsCache.planes.includes(val)) {
    adminSettingsCache.planes.push(val);
    renderAdminSettingsUI();
  }
  document.getElementById('adminNuevoPlan').value = '';
}

function eliminarPlanAdmin(idx) {
  if (adminSettingsCache.planes) {
    adminSettingsCache.planes.splice(idx, 1);
    renderAdminSettingsUI();
  }
}

function agregarNodoAdmin() {
  const val = document.getElementById('adminNuevoNodo').value.trim().toUpperCase();
  if (!val) return;
  if (!adminSettingsCache.nodos.includes(val)) {
    adminSettingsCache.nodos.push(val);
    renderAdminSettingsUI();
  }
  document.getElementById('adminNuevoNodo').value = '';
}

function eliminarNodoAdmin(idx) {
  adminSettingsCache.nodos.splice(idx, 1);
  renderAdminSettingsUI();
}

function agregarPromoAdmin() {
  const val = document.getElementById('adminNuevaPromo').value.trim().toUpperCase();
  const req = document.getElementById('adminPromoRequiereConfig').checked;
  if (!val) return;
  adminSettingsCache.promociones.push({ nombre: val, pasa_por_config: req });
  renderAdminSettingsUI();
  document.getElementById('adminNuevaPromo').value = '';
}

function eliminarPromoAdmin(idx) {
  adminSettingsCache.promociones.splice(idx, 1);
  renderAdminSettingsUI();
}

function agregarMetodoPagoAdmin() {
  const val = document.getElementById('adminNuevoMetodoPago').value.trim().toUpperCase();
  if (!val) return;
  if (!adminSettingsCache.metodos_pago.includes(val)) {
    adminSettingsCache.metodos_pago.push(val);
    renderAdminSettingsUI();
  }
  document.getElementById('adminNuevoMetodoPago').value = '';
}

function eliminarMetodoPagoAdmin(idx) {
  adminSettingsCache.metodos_pago.splice(idx, 1);
  renderAdminSettingsUI();
}

async function guardarConfiguracionSistemaAdmin() {
  try {
    toast('Guardando ajustes del sistema...', 'info');
    const res = await apiPost('/admin/settings', adminSettingsCache);
    toast('✅ Ajustes del sistema guardados en la base de datos');
    // Aplicar el nuevo orden al sidebar sin cambiar de vista ni redirigir
    if (currentUser) applyRolePermissions(currentUser.rol, false);
  } catch (err) {
    toast('Error guardando ajustes: ' + err.message, 'error');
  }
}

function exportarDataCSV() {
  window.open(`${API_URL}/equipos/stock`, '_blank');
}

function generarReportePDF(depto) {
  toast(`📄 Generando reporte PDF de ${depto.toUpperCase()}...`);
  window.print();
}

// ================= GESTIÓN DE USUARIOS Y ROLES (ADMIN) =================
async function cargarUsuariosAdmin() {
  const container = document.getElementById('adminListaUsuarios');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted)">Cargando usuarios...</p>';
  try {
    const usuarios = await apiGet('/auth/usuarios');
    if (!usuarios || !usuarios.length) {
      container.innerHTML = '<p style="color:var(--muted)">No hay usuarios registrados.</p>';
      return;
    }

    let html = '<table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Acciones</th></tr></thead><tbody>';
    usuarios.forEach(u => {
      html += `<tr>
        <td><b>${u.nombre}</b></td>
        <td>${u.email}</td>
        <td>
          <select onchange="editarRolUsuarioAdmin('${u.id}', this.value)" style="padding:.2rem .4rem; font-size:.8rem; font-weight:700; border-color:var(--accent)">
            <option value="ADMIN" ${u.rol === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
            <option value="ASESOR" ${u.rol === 'ASESOR' ? 'selected' : ''}>ASESOR</option>
            <option value="ALMACEN" ${u.rol === 'ALMACEN' ? 'selected' : ''}>ALMACEN</option>
            <option value="CONFIGURADOR" ${u.rol === 'CONFIGURADOR' ? 'selected' : ''}>CONFIGURADOR</option>
            <option value="INSTALADOR" ${u.rol === 'INSTALADOR' ? 'selected' : ''}>INSTALADOR</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:.3rem">
            <button type="button" class="btn" style="padding:.2rem .5rem; font-size:.75rem; width:auto; margin:0" onclick="cambiarPasswordUsuarioAdmin('${u.id}', '${u.nombre}')">🔑 Clave</button>
            <button type="button" class="btn danger" style="padding:.2rem .5rem; font-size:.75rem; width:auto; margin:0" onclick="eliminarUsuarioAdmin('${u.id}', '${u.nombre}')">🗑️ Borrar</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger)">Error al obtener lista de usuarios</p>';
  }
}

async function handleCrearUsuarioAdmin(e) {
  e.preventDefault();
  const nombre = document.getElementById('userNuevoNombre').value.trim();
  const email = document.getElementById('userNuevoEmail').value.trim();
  const password = document.getElementById('userNuevoPass').value.trim();
  const rol = document.getElementById('userNuevoRol').value;

  if (!nombre || !email || !password) return toast('Completa todos los campos obligatorios', 'error');

  try {
    toast('Creando usuario...', 'info');
    const res = await apiPost('/auth/usuarios', { nombre, email, password, rol });
    toast(`✅ ${res.message}`);
    document.getElementById('userNuevoNombre').value = '';
    document.getElementById('userNuevoEmail').value = '';
    document.getElementById('userNuevoPass').value = '';
    cargarUsuariosAdmin();
  } catch (err) {
    toast('Error creando usuario: ' + err.message, 'error');
  }
}

async function editarRolUsuarioAdmin(userId, nuevoRol) {
  try {
    const res = await apiPut(`/auth/usuarios/${userId}`, { rol: nuevoRol });
    toast(`✅ Rol actualizado a ${nuevoRol}`);
  } catch (err) {
    toast('Error actualizando rol: ' + err.message, 'error');
  }
}

async function cambiarPasswordUsuarioAdmin(userId, nombre) {
  const newPass = prompt(`Escribe la nueva contraseña para ${nombre}:`);
  if (!newPass) return;
  try {
    const res = await apiPut(`/auth/usuarios/${userId}`, { password: newPass });
    toast(`✅ Contraseña actualizada para ${nombre}`);
  } catch (err) {
    toast('Error cambiando contraseña: ' + err.message, 'error');
  }
}

async function eliminarUsuarioAdmin(userId, nombre) {
  if (!confirm(`¿Seguro que deseas eliminar al usuario ${nombre}?`)) return;
  try {
    const res = await apiDelete(`/auth/usuarios/${userId}`);
    toast(`✅ Usuario ${nombre} eliminado`);
    cargarUsuariosAdmin();
  } catch (err) {
    toast('Error eliminando usuario: ' + err.message, 'error');
  }
}

// ================= IMPORTADOR MASIVO DE DATOS (CSV / EXCEL) =================
function toggleModoImportacionUI(modo) {
  document.getElementById('boxImportarPegar').style.display = (modo === 'pegar') ? 'block' : 'none';
  document.getElementById('boxImportarArchivo').style.display = (modo === 'csv') ? 'block' : 'none';
}

async function handleImportarDataMasiva(e) {
  e.preventDefault();
  const tipo = document.getElementById('impTipo').value;
  const modo = document.getElementById('impModo').value;

  let rawText = '';

  if (modo === 'pegar') {
    rawText = document.getElementById('impTextarea').value.trim();
    if (!rawText) return toast('Pega los datos de Excel en el cuadro de texto', 'error');
    await procesarTextoEImportar(tipo, rawText);
  } else {
    const fileInput = document.getElementById('impFileInput');
    if (!fileInput.files || !fileInput.files.length) return toast('Selecciona un archivo .CSV o .TXT', 'error');
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async function(evt) {
      rawText = evt.target.result;
      await procesarTextoEImportar(tipo, rawText);
    };
    reader.readAsText(file);
  }
}

async function procesarTextoEImportar(tipo, textContent) {
  const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return toast('No hay líneas válidas para procesar', 'error');

  const items = [];

  lines.forEach(line => {
    const parts = line.split(/[\t,]+/).map(p => p.trim());
    if (tipo === 'equipos') {
      if (parts.length >= 1) {
        items.push({
          serial_pon: parts[0],
          modelo: parts[1] || 'AX30-H',
          marca: parts[2] || 'VSOL',
          estado: 'DISPONIBLE'
        });
      }
    } else if (tipo === 'ventas') {
      if (parts.length >= 1) {
        items.push({
          nombre_cliente: parts[0],
          cedula_rif: parts[1] || '',
          nro_contacto: parts[2] || '',
          nodo: parts[3] || 'NODO CENTRO',
          plan_servicio: parts[4] || 'PLAN 100 MEGA FIBRA',
          promocion: parts[5] || 'ESTÁNDAR'
        });
      }
    }
  });

  if (!items.length) return toast('No se pudieron estructurar ítems válidos', 'error');

  try {
    toast(`Importando ${items.length} registros a la base de datos...`, 'info');
    const endpoint = tipo === 'equipos' ? '/admin/importar/equipos' : '/admin/importar/ventas';
    const res = await apiPost(endpoint, { items });
    toast(`✅ ${res.message}`);
    document.getElementById('impTextarea').value = '';
    cargarEstadisticasDashboard();
  } catch (err) {
    toast('Error importando datos: ' + err.message, 'error');
  }
}

// ================= MÓDULO DE INVENTARIO GENERAL =================
let inventarioCache = [];

async function cargarInventario() {
  const container = document.getElementById('tablaInventarioContainer');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted); padding:1rem">⏳ Cargando datos de inventario desde Supabase...</p>';

  try {
    const data = await apiGet('/equipos');
    inventarioCache = Array.isArray(data) ? data : [];

    // Actualizar métricas
    const total = inventarioCache.length;
    const disponibles = inventarioCache.filter(e => (e.estado || '').toUpperCase() === 'DISPONIBLE').length;
    const reservados = inventarioCache.filter(e => ['RESERVADO', 'ASIGNADO', 'EN_RUTA'].includes((e.estado || '').toUpperCase())).length;
    const instalados = inventarioCache.filter(e => (e.estado || '').toUpperCase() === 'INSTALADO').length;

    if (document.getElementById('invStatTotal')) document.getElementById('invStatTotal').textContent = total;
    if (document.getElementById('invStatDisponibles')) document.getElementById('invStatDisponibles').textContent = disponibles;
    if (document.getElementById('invStatReservados')) document.getElementById('invStatReservados').textContent = reservados;
    if (document.getElementById('invStatInstalados')) document.getElementById('invStatInstalados').textContent = instalados;

    filtrarInventario();
  } catch (err) {
    container.innerHTML = `<p style="color:var(--error); padding:1rem">❌ Error al cargar inventario: ${err.message}</p>`;
  }
}

function filtrarInventario() {
  const container = document.getElementById('tablaInventarioContainer');
  if (!container) return;

  const search = (document.getElementById('invSearchInput')?.value || '').toLowerCase().trim();
  const estadoFiltro = (document.getElementById('invFiltroEstado')?.value || 'TODOS').toUpperCase();
  const modeloFiltro = (document.getElementById('invFiltroModelo')?.value || 'TODOS').toUpperCase();

  const filtrados = inventarioCache.filter(item => {
    const textMatch = !search || 
      (item.id || '').toLowerCase().includes(search) ||
      (item.serial_pon || '').toLowerCase().includes(search) ||
      (item.modelo || '').toLowerCase().includes(search) ||
      (item.cliente_asignado || '').toLowerCase().includes(search);

    const est = (item.estado || '').toUpperCase();
    let estadoMatch = true;
    if (estadoFiltro === 'DISPONIBLE') estadoMatch = est === 'DISPONIBLE';
    else if (estadoFiltro === 'RESERVADO') estadoMatch = ['RESERVADO', 'ASIGNADO'].includes(est);
    else if (estadoFiltro === 'EN_RUTA') estadoMatch = est === 'EN_RUTA';
    else if (estadoFiltro === 'INSTALADO') estadoMatch = est === 'INSTALADO';
    else if (estadoFiltro === 'GARANTIA') estadoMatch = est.includes('GARANTIA');

    const mod = (item.modelo || '').toUpperCase();
    const modeloMatch = modeloFiltro === 'TODOS' || mod.includes(modeloFiltro);

    return textMatch && estadoMatch && modeloMatch;
  });

  if (filtrados.length === 0) {
    container.innerHTML = '<p style="color:var(--muted); padding:1.5rem; text-align:center">No se encontraron equipos con los criterios de búsqueda.</p>';
    return;
  }

  let html = `<table>
    <thead>
      <tr>
        <th>ID Equipo</th>
        <th>Serial PON</th>
        <th>Modelo</th>
        <th>Marca</th>
        <th>Estado</th>
        <th>Cliente Asignado</th>
        <th>Fecha Ingreso</th>
        <th>Fecha Inst.</th>
      </tr>
    </thead>
    <tbody>`;

  filtrados.forEach(e => {
    let badgeClass = 'badge-secondary';
    const st = (e.estado || '').toUpperCase();
    if (st === 'DISPONIBLE') badgeClass = 'badge-success';
    else if (['RESERVADO', 'ASIGNADO', 'EN_RUTA'].includes(st)) badgeClass = 'badge-warning';
    else if (st === 'INSTALADO') badgeClass = 'badge-primary';
    else if (st.includes('GARANTIA')) badgeClass = 'badge-danger';

    const fechaIng = e.fecha_ingreso ? e.fecha_ingreso.split('T')[0] : '-';
    const fechaInst = e.fecha_instalacion ? e.fecha_instalacion.split('T')[0] : '-';

    html += `<tr>
      <td><strong>${e.id || '-'}</strong></td>
      <td><code>${e.serial_pon || '-'}</code></td>
      <td>${e.modelo || '-'}</td>
      <td>${e.marca || 'VSOL'}</td>
      <td><span class="badge ${badgeClass}">${st}</span></td>
      <td>${e.cliente_asignado || '-'}</td>
      <td>${fechaIng}</td>
      <td>${fechaInst}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}
