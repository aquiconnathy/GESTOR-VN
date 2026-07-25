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
function toast(msg, type = 'info
