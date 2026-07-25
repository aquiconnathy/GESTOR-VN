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
