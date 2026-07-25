-- Migration Script 03: Actualización y Sincronización Completa de Esquema Supabase
-- Ejecuta este script en el SQL Editor de Supabase para estructurar e indexar la base de datos completa.

-- 1. Campos adicionales para ciclo de vida y facturación
ALTER TABLE IF EXISTS ventas ADD COLUMN IF NOT EXISTS numero_servicio VARCHAR DEFAULT '1';
ALTER TABLE IF EXISTS instalaciones ADD COLUMN IF NOT EXISTS numero_servicio VARCHAR DEFAULT '1';
ALTER TABLE IF EXISTS instalaciones ADD COLUMN IF NOT EXISTS correo_electronico TEXT;

-- 2. Permitir modelos de equipos dinámicos sin restricciones estáticas
ALTER TABLE IF EXISTS equipos DROP CONSTRAINT IF EXISTS equipos_modelo_check;

-- 3. Tabla de Configuración Global y Parámetros del Sistema
CREATE TABLE IF NOT EXISTS config_system (
    key VARCHAR PRIMARY KEY,
    value_int INTEGER DEFAULT 0,
    value_str TEXT,
    value_text TEXT
);

ALTER TABLE IF EXISTS config_system ADD COLUMN IF NOT EXISTS value_str TEXT;
ALTER TABLE IF EXISTS config_system ADD COLUMN IF NOT EXISTS value_text TEXT;

-- 4. Inicialización de Contadores de Secuencia (Auto-correlativos)
INSERT INTO config_system (key, value_int) VALUES
    ('seq_recepcion', 0),
    ('seq_instalacion', 0),
    ('seq_eetl', 0),
    ('seq_despacho', 0),
    ('seq_eq_ax', 0),
    ('seq_eq_onu', 0),
    ('seq_eq_ac', 0),
    ('seq_eqc', 0),
    ('seq_venta', 0)
ON CONFLICT (key) DO NOTHING;

-- 5. Tabla de Despachos de Logística
CREATE TABLE IF NOT EXISTS despachos (
    id VARCHAR PRIMARY KEY,
    fecha_despacho TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    instalador TEXT,
    firma_instalador TEXT,
    cantidad INTEGER DEFAULT 0,
    ids_instalaciones TEXT,
    observaciones TEXT
);

-- 6. Tabla de Evaluaciones Técnicas y Laboratorio
CREATE TABLE IF NOT EXISTS evaluaciones (
    id SERIAL PRIMARY KEY,
    serial_pon VARCHAR NOT NULL,
    modelo VARCHAR,
    marca VARCHAR DEFAULT 'VSOL',
    motivo VARCHAR NOT NULL,
    dictamen VARCHAR,
    nombre_cliente TEXT,
    tecnico TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Índices para Trazabilidad Ultrarrápida por Serial, Cédula o Nombre
CREATE INDEX IF NOT EXISTS idx_equipos_serial ON equipos(serial_pon);
CREATE INDEX IF NOT EXISTS idx_equipos_estado ON equipos(estado);
CREATE INDEX IF NOT EXISTS idx_instalaciones_cedula ON instalaciones(cedula_rif);
CREATE INDEX IF NOT EXISTS idx_instalaciones_status ON instalaciones(status);
CREATE INDEX IF NOT EXISTS idx_ventas_cedula ON ventas(cedula_rif);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_serial ON evaluaciones(serial_pon);
