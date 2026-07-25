from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, text, Boolean
from sqlalchemy.sql import func
from app.db import Base

class Recepcion(Base):
    __tablename__ = "recepciones"
    id = Column(String, primary_key=True)
    fecha_ingreso = Column(DateTime(timezone=True), server_default=func.now())
    entrega = Column(Text)
    recibe = Column(Text)
    firma_entrega = Column(Text)
    firma_recibe = Column(Text)
    observaciones = Column(Text)
    cantidad = Column(Integer, default=0)
    cant_ax = Column(Integer, default=0)
    cant_onu = Column(Integer, default=0)
    cant_ac = Column(Integer, default=0)
    estado = Column(String, default="COMPLETADA")

class Equipo(Base):
    __tablename__ = "equipos"
    id = Column(String, primary_key=True)
    serial_pon = Column(String, unique=True, nullable=False)
    password_pon = Column(Text)
    modelo = Column(String)
    marca = Column(String, default="VSOL")
    fecha_ingreso = Column(DateTime(timezone=True), server_default=func.now())
    estado = Column(String, default="DISPONIBLE")
    id_recepcion = Column(String, ForeignKey("recepciones.id"))
    id_instalacion = Column(String)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Venta(Base):
    __tablename__ = "ventas"
    id = Column(Integer, primary_key=True, autoincrement=True)
    id_venta = Column(String, unique=True)
    fecha_venta = Column(Date, server_default=func.current_date())
    asesor_venta = Column(Text)
    promocion = Column(Text)
    nodo = Column(Text)
    nombre_cliente = Column(Text)
    tipo_id = Column(String, default="V")
    cedula_rif = Column(Text)
    fecha_nacimiento = Column(Date)
    correo_electronico = Column(Text)
    nro_contacto = Column(Text)
    direccion_exacta = Column(Text)
    plan_servicio = Column(Text)
    numero_servicio = Column(String, default="1")
    status_venta = Column(String, default="APROBADA")
    id_instalacion = Column(String)
    status_instalacion = Column(String, default="PENDIENTE_ASIGNAR")
    fecha_instalacion = Column(Date)
    observaciones = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Instalacion(Base):
    __tablename__ = "instalaciones"
    id = Column(String, primary_key=True)
    id_venta = Column(Integer, ForeignKey("ventas.id"))
    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())
    asesor_venta = Column(Text)
    promocion = Column(Text)
    nodo = Column(Text)
    nombre_cliente = Column(Text)
    tipo_id = Column(String, default="V")
    cedula_rif = Column(Text)
    fecha_nacimiento = Column(Date)
    correo_electronico = Column(Text)
    nro_contacto = Column(Text)
    direccion_exacta = Column(Text)
    plan_servicio = Column(Text)
    numero_servicio = Column(String, default="1")
    status = Column(String, default="PENDIENTE_ASIGNAR")
    serial_onu = Column(Text)
    pppoe = Column(Text)
    modelo = Column(Text)
    marca = Column(Text)
    codigo_fibra = Column(Text)
    credencial_admin_usuario = Column(Text)
    credencial_admin_clave = Column(Text)
    wifi_2g_nombre = Column(Text)
    wifi_2g_clave = Column(Text)
    wifi_5g_nombre = Column(Text)
    wifi_5g_clave = Column(Text)
    instalador = Column(Text)
    configurado_por = Column(Text)
    fecha_configuracion = Column(DateTime(timezone=True))
    fecha_instalacion = Column(Date)
    observaciones = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Despacho(Base):
    __tablename__ = "despachos"
    id = Column(String, primary_key=True)
    fecha_despacho = Column(DateTime(timezone=True), server_default=func.now())
    instalador = Column(Text)
    firma_instalador = Column(Text)
    cantidad = Column(Integer)
    ids_instalaciones = Column(Text)
    observaciones = Column(Text)

class EquipoCliente(Base):
    __tablename__ = "equipos_cliente"
    id = Column(String, primary_key=True)
    serial_pon = Column(Text)
    marca = Column(Text)
    modelo = Column(Text)
    nombre_cliente = Column(Text)
    cedula_rif = Column(Text)
    id_instalacion = Column(Text)
    fecha_instalacion = Column(Date)
    instalador = Column(Text)
    pppoe = Column(Text)
    credencial_admin_usuario = Column(Text)
    credencial_admin_clave = Column(Text)
    nodo = Column(Text)
    nro_contacto = Column(Text)
    direccion = Column(Text)
    plan = Column(Text)
    promocion = Column(Text, default="ESTE ES TU LUGAR")
    codigo_fibra = Column(Text)

class ConfigSystem(Base):
    __tablename__ = "config_system"
    key = Column(String, primary_key=True)
    value_int = Column(Integer, default=0)
    value_text = Column(Text)

class TelegramLog(Base):
    __tablename__ = "telegram_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key_notif = Column(String, unique=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(String, primary_key=True)
    nombre = Column(Text, nullable=False)
    email = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    rol = Column(String, nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
