from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.db import get_db
from app.models import Equipo
from app.schemas import MsgOut

router = APIRouter(prefix="/evaluacion", tags=["Evaluación y Laboratorio"])

class IngresoEvaluacionIn(BaseModel):
    serial_pon: str
    modelo: Optional[str] = "AX30-H"
    marca: Optional[str] = "VSOL"
    motivo: str  # CONFIGURACION, EVALUACION_DANO, VERIFICACION_FUNCIONES, REINTEGRO_INVENTARIO, DESCARTE
    nombre_cliente: Optional[str] = None
    observaciones: Optional[str] = None
    tecnico: Optional[str] = None

class DictamenIn(BaseModel):
    serial_pon: str
    dictamen: str  # REINTEGRO_INVENTARIO, DESCARTE, EN_REPARACION
    observaciones: Optional[str] = None

@router.post("/ingresar", response_model=MsgOut)
async def ingresar_equipo_evaluacion(data: IngresoEvaluacionIn, db: AsyncSession = Depends(get_db)):
    serial = data.serial_pon.strip().upper()
    if not serial:
        raise HTTPException(status_code=400, detail="Serial PON obligatorio")

    stmt = select(Equipo).where(Equipo.serial_pon == serial)
    res = await db.execute(stmt)
    eq = res.scalar_one_or_none()

    if eq:
        eq.estado = f"EVALUACION_{data.motivo.upper()}"
        eq.observaciones = f"[{data.motivo}] {data.observaciones or ''} (Por: {data.tecnico or 'Técnico'})"
    else:
        # Registrar nuevo equipo ingresado
        id_eq = f"EV_{serial[-6:]}"
        eq = Equipo(
            id=id_eq,
            serial_pon=serial,
            modelo=(data.modelo or "AX30-H").upper(),
            marca=(data.marca or "VSOL").upper(),
            estado=f"EVALUACION_{data.motivo.upper()}",
            observaciones=f"[{data.motivo}] {data.observaciones or ''} (Cliente: {data.nombre_cliente or '-'})"
        )
        db.add(eq)

    await db.commit()
    return MsgOut(status="success", message=f"Equipo {serial} ingresado a Evaluación [{data.motivo}]")

@router.get("/listar")
async def listar_equipos_evaluacion(db: AsyncSession = Depends(get_db)):
    stmt = select(Equipo).where(Equipo.estado.like("EVALUACION_%"))
    res = await db.execute(stmt)
    equipos = res.scalars().all()
    return [
        {
            "id": e.id,
            "serial_pon": e.serial_pon,
            "modelo": e.modelo,
            "marca": e.marca,
            "estado": e.estado,
            "observaciones": e.observaciones,
            "fecha_ingreso": e.fecha_ingreso
        } for e in equipos
    ]

@router.post("/dictamen", response_model=MsgOut)
async def dictamen_evaluacion(data: DictamenIn, db: AsyncSession = Depends(get_db)):
    serial = data.serial_pon.strip().upper()
    stmt = select(Equipo).where(Equipo.serial_pon == serial)
    res = await db.execute(stmt)
    eq = res.scalar_one_or_none()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado en evaluación")

    if data.dictamen == "REINTEGRO_INVENTARIO":
        eq.estado = "DISPONIBLE"
        msg = f"Equipo {serial} aprobado y REINTEGRADO AL STOCK DISPONIBLE"
    elif data.dictamen == "DESCARTE":
        eq.estado = "DESCARTE"
        msg = f"Equipo {serial} dado de BAJA / DESCARTE por falla técnica"
    else:
        eq.estado = f"EVALUACION_{data.dictamen}"
        msg = f"Equipo {serial} actualizado a {data.dictamen}"

    if data.observaciones:
        eq.observaciones = (eq.observaciones or "") + f" | Dictamen: {data.observaciones}"

    await db.commit()
    return MsgOut(status="success", message=msg)
