-- ============================================================
-- UMSR v2.0 - Tabla de Usuarios y Roles
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('ADMIN','ASESOR','ALMACEN','CONFIGURADOR','INSTALADOR')),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_authenticated_usuarios" ON usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insertar usuarios demo iniciales (password simple hashed con sha256)
-- admin123 -> 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES 
    ('Administrador', 'admin@gestorvn.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'ADMIN'),
    ('Asesor Ventas', 'asesor@gestorvn.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'ASESOR'),
    ('Almacén Depósito', 'almacen@gestorvn.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'ALMACEN'),
    ('Configurador Técnico', 'config@gestorvn.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'CONFIGURADOR'),
    ('Instalador Campo', 'tecnico@gestorvn.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'INSTALADOR')
ON CONFLICT (email) DO NOTHING;
