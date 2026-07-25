// ================= CONFIGURACIÓN =================
const API_URL = 'https://gestor-vn-production.up.railway.app';
let html5QrCode = null;
let scanned = [];

// ================= NAVEGACIÓN =================
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  
  // Buscar el botón correspondiente sin depender de event.target
  const buttons = document.querySelectorAll('nav button');
  buttons.forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    if (onclick.includes("'" + id + "'") || onclick.includes('"' + id + '"')) {
      b.classList.add('active');
    }
  });
  
  if (id === 'instalaciones') cargarPendientes();
}

// ================= TOAST =================
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.borderColor = type === 'error' ? '#ef4444' : '#3b82f6';
  setTimeout(() => t.style.display = 'none', 3000);
}

// ================= OFFLINE DETECT =================
window.addEventListener('online', () => {
  document.getElementById('offlineBanner').style.display = 'none';
  syncPending();
});
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').style.display = 'block';
});

// ================= SCANNER =================
function toggleScanner() {
  const reader = document.getElementById('reader');
  if (html5QrCode) {
    html5QrCode.stop().then(() => { html5QrCode = null; reader.innerHTML = ''; });
    return;
  }
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    (decodedText) => {
      const serial = decodedText.trim().toUpperCase();
      if (/^VSOL[0-9A-F]{8}$/.test(serial) && !scanned.includes(serial)) {
        scanned.push(serial);
        document.getElementById('scannedList').value = scanned.map(s => s + ',AX30-H').join('\n');
        document.getElementById('scanCount').textContent = scanned.length;
        toast('Serial agregado: ' + serial);
      }
    },
    (err) => {}
  ).catch(err => toast('Error cámara: ' + err, 'error'));
}

// ================= API HELPERS =================
async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');
    return data;
  } catch (e) {
    queueOperation({ path, body });
    throw e;
  }
}

async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`);
  return res.json();
}

// ================= OFFLINE QUEUE =================
function queueOperation(op) {
  let q = JSON.parse(localStorage.getItem('umsr_queue') || '[]');
  q.push(op);
  localStorage.setItem('umsr_queue', JSON.stringify(q));
  toast('Operación guardada offline', 'info');
}

async function syncPending() {
  let q = JSON.parse(localStorage.getItem('umsr_queue') || '[]');
  if (!q.length) return;
  for (let op of q) {
    try {
      await fetch(`${API_URL}${op.path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.body)
      });
    } catch (e) {}
  }
  localStorage.removeItem('umsr_queue');
  toast('Sincronización completada');
}

// ================= RECEPCIÓN =================
async function enviarRecepcion() {
  const raw = document.getElementById('scannedList').value.trim();
  if (!raw) return toast('Escanea al menos un serial', 'error');
  const equipos = raw.split('\n').map(line => {
    const [serial, modelo] = line.split(',');
    return { serial_pon: serial.trim(), modelo: (modelo || 'AX30-H').trim() };
  }).filter(e => e.serial_pon);

  try {
    const data = await apiPost('/equipos/recepcion', {
      equipos,
      entrega: document.getElementById('recEntrega').value,
      recibe: document.getElementById('recRecibe').value,
      observaciones: document.getElementById('recObs').value
    });
    toast(`Recepción ${data.id} guardada (${data.cantidad} equipos)`);
    scanned = []; document.getElementById('scannedList').value = '';
    document.getElementById('scanCount').textContent = '0';
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ================= PENDIENTES =================
async function cargarPendientes() {
  const container = document.getElementById('listaPendientes');
  container.innerHTML = '<p>Cargando...</p>';
  try {
    const data = await apiGet('/instalaciones/pendientes');
    if (!data.length) { container.innerHTML = '<p>Sin pendientes</p>'; return; }
    let html = '<table><tr><th>ID</th><th>Cliente</th><th>Nodo</th><th>Status</th></tr>';
    data.forEach(i => {
      const badge = i.status.toLowerCase().replace('_','');
      html += `<tr><td>${i.id}</td><td>${i.nombre_cliente}</td><td>${i.nodo||'-'}</td><td><span class="badge ${badge}">${i.status}</span></td></tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p>Error cargando datos</p>';
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
      instalado_por: 'AppSheet'
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
