from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

# ---------- EQUIPOS ----------
class EquipoIn(BaseModel):
    serial_pon: str
    modelo: str
    marca: Optional[str] = "VSOL"

class EquipoOut(EquipoIn):
    id: str
    estado: str
    fecha_ingreso: datetime
    cliente_asignado: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    id_recepcion: Optional[str]
    class Config:
        from_attributes = True

# ---------- RECEPCIONES ----------
class RecepcionItem(BaseModel):
    serial_pon: str
    modelo: Optional[str] = "AX30-H"

class RecepcionIn(BaseModel):
    equipos: List[RecepcionItem] = Field(..., min_length=1, max_length=100)
    fecha_ingreso: Optional[datetime] = None
    entrega: Optional[str] = ""
    recibe: Optional[str] = ""
    firma_entrega: Optional[str] = ""  # base64 o URL
    firma_recibe: Optional[str] = ""
    observaciones: Optional[str] = ""

class RecepcionOut(BaseModel):
    id: str
    fecha_ingreso: datetime
    cantidad: int
    cant_ax: int
    cant_onu: int
    cant_ac: int
    estado: str
    equipos: List[EquipoOut]
    class Config:
        from_attributes = True

# ---------- INSTALACIONES ----------
class InstalacionIn(BaseModel):
    id_venta: Optional[int] = None
    asesor_venta: Optional[str] = None
    promocion: Optional[str] = None
    nodo: Optional[str] = None
    nombre_cliente: str
    tipo_id: Optional[str] = "V"
    cedula_rif: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    correo_electronico: Optional[str] = None
    nro_contacto: Optional[str] = None
    direccion_exacta: Optional[str] = None
    plan_servicio: Optional[str] = None
    observaciones: Optional[str] = None

class InstalacionUpdate(BaseModel):
    status: Optional[str] = None
    serial_onu: Optional[str] = None
    pppoe: Optional[str] = None
    modelo: Optional[str] = None
    marca: Optional[str] = None
    codigo_fibra: Optional[str] = None
    credencial_admin_usuario: Optional[str] = None
    credencial_admin_clave: Optional[str] = None
    instalador: Optional[str] = None
    configurado_por: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    observaciones: Optional[str] = None

class InstalacionOut(BaseModel):
    id: str
    id_venta: Optional[int] = None
    fecha_registro: datetime
    status: str
    nombre_cliente: str
    tipo_id: Optional[str] = "V"
    cedula_rif: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    correo_electronico: Optional[str] = None
    nro_contacto: Optional[str] = None
    direccion_exacta: Optional[str] = None
    plan_servicio: Optional[str] = None
    promocion: Optional[str] = None
    nodo: Optional[str] = None
    serial_onu: Optional[str] = None
    pppoe: Optional[str] = None
    modelo: Optional[str] = None
    marca: Optional[str] = None
    codigo_fibra: Optional[str] = None
    credencial_admin_usuario: Optional[str] = None
    credencial_admin_clave: Optional[str] = None
    instalador: Optional[str] = None
    configurado_por: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    observaciones: Optional[str] = None
    class Config:
        from_attributes = True

# ---------- DESPACHOS ----------
class DespachoIn(BaseModel):
    id_instalaciones: List[str]
    instalador: str
    fecha_despacho: Optional[datetime] = None
    firma_instalador: Optional[str] = ""  # base64/URL
    observaciones: Optional[str] = ""

class DespachoOut(DespachoIn):
    id: str
    cantidad: int
    class Config:
        from_attributes = True

# ---------- VENTAS ----------
class VentaIn(BaseModel):
    id_venta: Optional[str] = None
    fecha_venta: Optional[date] = None
    asesor_venta: Optional[str] = None
    promocion: Optional[str] = None
    nodo: Optional[str] = None
    nombre_cliente: str
    tipo_id: Optional[str] = "V"
    cedula_rif: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    correo_electronico: Optional[str] = None
    nro_contacto: Optional[str] = None
    direccion_exacta: Optional[str] = None
    plan_servicio: Optional[str] = None
    numero_servicio: Optional[str] = "1"
    observaciones: Optional[str] = None

class VentaOut(VentaIn):
    id: int
    status_venta: str
    status_instalacion: str
    id_instalacion: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

# ---------- CONFIGURACIÓN / EETL ----------
class ConfiguracionIn(BaseModel):
    id_instalacion: str
    nombre_cliente: Optional[str] = None
    cedula_rif: Optional[str] = None
    nro_contacto: Optional[str] = None
    correo_electronico: Optional[str] = None
    direccion_exacta: Optional[str] = None
    nodo: Optional[str] = None
    plan_servicio: Optional[str] = None
    promocion: Optional[str] = None
    serial_onu: Optional[str] = None
    pppoe: Optional[str] = None
    modelo: Optional[str] = None
    marca: Optional[str] = None
    codigo_fibra: Optional[str] = None
    credencial_admin_usuario: Optional[str] = None
    credencial_admin_clave: Optional[str] = None
    configurado_por: Optional[str] = None
    observaciones: Optional[str] = None

class EETLIn(BaseModel):
    id_instalacion: str
    serial_pon: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    nombre_cliente: Optional[str] = None
    tipo_id: Optional[str] = None
    cedula_rif: Optional[str] = None
    nro_contacto: Optional[str] = None
    direccion: Optional[str] = None
    plan: Optional[str] = None
    nodo: Optional[str] = None
    pppoe: Optional[str] = None
    codigo_fibra: Optional[str] = None
    credencial_admin_usuario: Optional[str] = None
    credencial_admin_clave: Optional[str] = None
    instalado_por: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    observaciones: Optional[str] = None
    monto: Optional[float] = None

# ---------- MARCAR INSTALADO ----------
class InstaladoIn(BaseModel):
    id_instalacion: str
    fecha_instalacion: Optional[date] = None
    instalado_por: Optional[str] = "AppSheet"

# ---------- RESPUESTAS GENÉRICAS ----------
class MsgOut(BaseModel):
    status: str
    message: str
    id: Optional[str] = None
