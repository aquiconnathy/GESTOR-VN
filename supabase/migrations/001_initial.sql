
-- Habilitar UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla: recepciones
CREATE TABLE recepciones (
    id TEXT PRIMARY KEY,
    fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
    entrega TEXT,
    recibe TEXT,
    firma_entrega TEXT, -- URL a Supabase Storage
    firma_recibe TEXT,  -- URL a Supabase Storage
    observaciones TEXT,
    cantidad INTEGER DEFAULT 0,
    cant_ax INTEGER DEFAULT 0,
    cant_onu INTEGER DEFAULT 0,
    cant_ac INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'COMPLETADA'
);

-- Tabla: equipos
CREATE TABLE equipos (
    id TEXT PRIMARY KEY,
    serial_pon TEXT UNIQUE NOT NULL,
    password_pon TEXT,
    modelo TEXT CHECK (modelo IN ('AX30-H','V2801S-B','AC1200')),
    marca TEXT DEFAULT 'VSOL',
    fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE','ASIGNADO','CONFIGURADO','EN_RUTA','INSTALADO')),
    id_recepcion TEXT REFERENCES recepciones(id),
    id_instalacion TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_equipos_estado ON equipos(estado);
CREATE INDEX idx_equipos_serial ON equipos(serial_pon);

-- Tabla: ventas
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    id_venta TEXT UNIQUE,
    fecha_venta DATE DEFAULT CURRENT_DATE,
    asesor_venta TEXT,
    promocion TEXT,
    nodo TEXT,
    nombre_cliente TEXT,
    tipo_id TEXT DEFAULT 'V',
    cedula_rif TEXT,
    fecha_nacimiento DATE,
    correo_electronico TEXT,
    nro_contacto TEXT,
    direccion_exacta TEXT,
    plan_servicio TEXT,
    status_venta TEXT DEFAULT 'APROBADA',
    id_instalacion TEXT,
    status_instalacion TEXT DEFAULT 'PENDIENTE_ASIGNAR',
    fecha_instalacion DATE,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ventas_cedula ON ventas(cedula_rif);
CREATE INDEX idx_ventas_nombre ON ventas(nombre_cliente);

-- Tabla: instalaciones
CREATE TABLE instalaciones (
    id TEXT PRIMARY KEY,
    id_venta INTEGER REFERENCES ventas(id),
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    asesor_venta TEXT,
    promocion TEXT,
    nodo TEXT,
    nombre_cliente TEXT,
    tipo_id TEXT DEFAULT 'V',
    cedula_rif TEXT,
    fecha_nacimiento DATE,
    correo_electronico TEXT,
    nro_contacto TEXT,
    direccion_exacta TEXT,
    plan_servicio TEXT,
    status TEXT DEFAULT 'PENDIENTE_ASIGNAR' CHECK (status IN ('PENDIENTE_ASIGNAR','EN_RUTA','CONFIGURADO','INSTALADO')),
    serial_onu TEXT,
    pppoe TEXT,
    modelo TEXT,
    marca TEXT,
    codigo_fibra TEXT,
    credencial_admin_usuario TEXT,
    credencial_admin_clave TEXT,
    wifi_2g_nombre TEXT,
    wifi_2g_clave TEXT,
    wifi_5g_nombre TEXT,
    wifi_5g_clave TEXT,
    instalador TEXT,
    configurado_por TEXT,
    fecha_configuracion TIMESTAMPTZ,
    fecha_instalacion DATE,
    observaciones TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inst_status ON instalaciones(status);
CREATE INDEX idx_inst_cedula ON instalaciones(cedula_rif);

-- Tabla: despachos
CREATE TABLE despachos (
    id TEXT PRIMARY KEY,
    fecha_despacho TIMESTAMPTZ DEFAULT NOW(),
    instalador TEXT,
    firma_instalador TEXT, -- URL Storage
    cantidad INTEGER,
    ids_instalaciones TEXT,
    observaciones TEXT
);

-- Tabla: equipos_cliente (EETL / equipos propios)
CREATE TABLE equipos_cliente (
    id TEXT PRIMARY KEY,
    serial_pon TEXT,
    marca TEXT,
    modelo TEXT,
    nombre_cliente TEXT,
    cedula_rif TEXT,
    id_instalacion TEXT,
    fecha_instalacion DATE,
    instalador TEXT,
    pppoe TEXT,
    credencial_admin_usuario TEXT,
    credencial_admin_clave TEXT,
    nodo TEXT,
    nro_contacto TEXT,
    direccion TEXT,
    plan TEXT,
    promocion TEXT DEFAULT 'ESTE ES TU LUGAR',
    codigo_fibra TEXT
);

-- Tabla: configuracion del sistema (para IDs secuenciales y promos)
CREATE TABLE config_system (
    key TEXT PRIMARY KEY,
    value_int INTEGER DEFAULT 0,
    value_text TEXT
);
INSERT INTO config_system (key, value_int) VALUES 
    ('seq_recepcion',0),
    ('seq_instalacion',0),
    ('seq_eetl',0),
    ('seq_despacho',0),
    ('seq_eq_ax',0),
    ('seq_eq_onu',0),
    ('seq_eq_ac',0),
    ('seq_eqc',0);

-- Tabla: logs de notificaciones (deduplicación Telegram)
CREATE TABLE telegram_logs (
    id SERIAL PRIMARY KEY,
    key_notif TEXT UNIQUE,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_equipos_updated_at BEFORE UPDATE ON equipos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_instalaciones_updated_at BEFORE UPDATE ON instalaciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS (ejemplo básico, ajustar según roles)
ALTER TABLE recepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE instalaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer/escribir todo (ajustar luego)
CREATE POLICY "allow_all" ON recepciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON equipos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON instalaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ventas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON despachos FOR ALL TO authenticated USING (true) WITH CHECK (true);
