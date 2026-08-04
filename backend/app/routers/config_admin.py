from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
from app.db import get_db
from app.models import ConfigSystem

router = APIRouter(prefix="/admin", tags=["Admin Settings"])

DEFAULT_SETTINGS = {
    "promociones": [
        {"nombre": "ESTÁNDAR", "pasa_por_config": True},
        {"nombre": "ESTE ES TU LUGAR", "pasa_por_config": True},
        {"nombre": "PROMO 50% DESCUENTO", "pasa_por_config": True},
        {"nombre": "MIGRACIÓN DIRECTA", "pasa_por_config": False}
    ],
    "planes": [
        "PLAN 100 MEGA FIBRA",
        "PLAN 200 MEGA FIBRA",
        "PLAN 300 MEGA FIBRA",
        "PLAN 500 MEGA FIBRA",
        "PLAN GIGA FIBRA DEDICADO"
    ],
    "nodos": ["NODO CENTRO", "NODO NORTE", "NODO SUR", "NODO ESTE", "NODO OESTE"],
    "metodos_pago": ["PAGO MÓVIL", "ZELLE", "TRANSFERENCIA BANCARIA", "EFECTIVO USD", "USDT BINANCE"],
    "modelos_equipos": ["AX30-H", "V2801S-B", "AC1200", "V2804AX30-H", "HG8145V5", "F670L", "WK-3801"],
    "menu_orden": ["dashboard", "ventas", "recepcion", "instalaciones", "despacho", "config", "evaluacion", "admin-config"]
}

class SystemSettings(BaseModel):
    promociones: Optional[List[Dict[str, Any]]] = None
    planes: Optional[List[str]] = None
    nodos: Optional[List[str]] = None
    metodos_pago: Optional[List[str]] = None
    modelos_equipos: Optional[List[str]] = None
    menu_orden: Optional[List[str]] = None

@router.get("/settings")
async def obtener_configuracion_sistema(db: AsyncSession = Depends(get_db)):
    stmt = select(ConfigSystem).where(ConfigSystem.key == "system_settings_json")
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()
    if not cfg or not cfg.value_str:
        return DEFAULT_SETTINGS
    try:
        return json.loads(cfg.value_str)
    except Exception:
        return DEFAULT_SETTINGS

@router.post("/settings")
async def guardar_configuracion_sistema(data: SystemSettings, db: AsyncSession = Depends(get_db)):
    stmt = select(ConfigSystem).where(ConfigSystem.key == "system_settings_json").with_for_update()
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()
    
    json_str = json.dumps(data.model_dump())
    if not cfg:
        cfg = ConfigSystem(key="system_settings_json", value_str=json_str)
        db.add(cfg)
    else:
        cfg.value_str = json_str
    
    await db.commit()
    return {"status": "success", "message": "Configuración del sistema guardada con éxito"}

class ImportarEquiposIn(BaseModel):
    items: List[Dict[str, Any]]

class ImportarVentasIn(BaseModel):
    items: List[Dict[str, Any]]

@router.post("/importar/equipos")
async def importar_equipos_masivo(data: ImportarEquiposIn, db: AsyncSession = Depends(get_db)):
    from app.models import Equipo
    count = 0
    for item in data.items:
        serial = str(item.get("serial_pon") or item.get("serial") or "").strip().upper()
        if not serial:
            continue
        modelo = str(item.get("modelo") or "AX30-H").strip().upper()
        marca = str(item.get("marca") or "VSOL").strip().upper()
        estado = str(item.get("estado") or "DISPONIBLE").strip().upper()
        
        stmt = select(Equipo).where(Equipo.serial_pon == serial)
        res = await db.execute(stmt)
        eq = res.scalar_one_or_none()
        if not eq:
            seq_key = f"seq_eq_{modelo.lower().replace('-','_').replace(' ','_')}"
            id_eq = await next_seq(db, seq_key, "EQ_", 3)
            eq = Equipo(id=id_eq, serial_pon=serial, modelo=modelo, marca=marca, estado=estado)
            db.add(eq)
        else:
            eq.modelo = modelo
            eq.marca = marca
            eq.estado = estado
        count += 1
    
    await db.commit()
    return {"status": "success", "message": f"Importados {count} equipos exitosamente"}

@router.post("/importar/ventas")
async def importar_ventas_masivo(data: ImportarVentasIn, db: AsyncSession = Depends(get_db)):
    from app.models import Venta, Instalacion
    count = 0
    for item in data.items:
        cliente = str(item.get("nombre_cliente") or item.get("cliente") or "").strip()
        if not cliente:
            continue
        cedula = str(item.get("cedula_rif") or item.get("cedula") or "").strip()
        contacto = str(item.get("nro_contacto") or item.get("contacto") or "").strip()
        nodo = str(item.get("nodo") or "NODO CENTRO").strip().upper()
        plan = str(item.get("plan_servicio") or item.get("plan") or "PLAN 100 MEGA FIBRA").strip()
        promo = str(item.get("promocion") or "ESTÁNDAR").strip().upper()
        num_serv = str(item.get("numero_servicio") or "1").strip()

        id_vta = f"V_IMP_{count+1:03d}"
        id_inst = f"INS_IMP_{count+1:03d}"

        v = Venta(
            id_venta=id_vta,
            nombre_cliente=cliente,
            cedula_rif=cedula,
            nro_contacto=contacto,
            nodo=nodo,
            plan_servicio=plan,
            promocion=promo,
            numero_servicio=num_serv,
            id_instalacion=id_inst,
            status_instalacion="PENDIENTE_ASIGNAR"
        )
        db.add(v)

        inst = Instalacion(
            id=id_inst,
            id_venta=id_vta,
            nombre_cliente=cliente,
            cedula_rif=cedula,
            nro_contacto=contacto,
            nodo=nodo,
            plan_servicio=plan,
            promocion=promo,
            numero_servicio=num_serv,
            status="PENDIENTE_ASIGNAR"
        )
        db.add(inst)
        count += 1

    await db.commit()
    return {"status": "success", "message": f"Importadas {count} ventas e instalaciones de prueba"}
