from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, func, or_
from typing import List
from datetime import datetime
from app.db import get_db
from app.models import Equipo, Recepcion, ConfigSystem
from app.schemas import RecepcionIn, RecepcionOut, EquipoOut
from app.services.telegram_service import tg_service
from app.core.config import get_settings

router = APIRouter(prefix="/equipos", tags=["Equipos"])
settings = get_settings()

async def next_seq(db: AsyncSession, key: str, prefix: str, pad: int = 3) -> str:
    stmt = select(ConfigSystem).where(ConfigSystem.key == key).with_for_update()
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()
    if not cfg:
        cfg = ConfigSystem(key=key, value_int=0)
        db.add(cfg)
    cfg.value_int += 1
    await db.flush()
    return f"{prefix}{str(cfg.value_int).zfill(pad)}"

@router.post("/recepcion", response_model=RecepcionOut)
async def recibir_equipos(data: RecepcionIn, db: AsyncSession = Depends(get_db)):
    if not data.equipos or len(data.equipos) > 100:
        raise HTTPException(status_code=400, detail="Lote inválido (1-100 equipos)")

    try:
        # Verificar duplicados
        seriales_enviados = [e.serial_pon.upper().strip() for e in data.equipos if e.serial_pon]
        stmt = select(Equipo.serial_pon).where(Equipo.serial_pon.in_(seriales_enviados))
        res = await db.execute(stmt)
        existentes = {r[0] for r in res.all()}

        id_rec = await next_seq(db, "seq_recepcion", "REC_", 3)
        now = datetime.now()

        # 1. Crear el objeto Recepción primero y hacer flush para cumplir la Foreign Key
        rec = Recepcion(
            id=id_rec, fecha_ingreso=data.fecha_ingreso or now,
            entrega=data.entrega or "", recibe=data.recibe or "",
            firma_entrega=data.firma_entrega or "", firma_recibe=data.firma_recibe or "",
            observaciones=data.observaciones or "",
            cantidad=0, cant_ax=0, cant_onu=0, cant_ac=0
        )
        db.add(rec)
        await db.flush()

        cant_ax = cant_onu = cant_ac = 0
        equipos_creados = []

        # 2. Insertar equipos asociados a id_rec
        for item in data.equipos:
            serial = item.serial_pon.upper().strip()
            modelo = (item.modelo or "AX30-H").upper().strip()
            if not serial or serial in existentes:
                continue

            seq_key = f"seq_eq_{modelo.lower().replace('-','_').replace(' ','_')}"
            id_eq = await next_seq(db, seq_key, "EQ_", 3)
            
            if modelo == "AX30-H": cant_ax += 1
            elif modelo == "V2801S-B": cant_onu += 1
            elif modelo == "AC1200": cant_ac += 1

            password = serial[4:] if serial.startswith("VSOL") else ""
            eq = Equipo(
                id=id_eq, serial_pon=serial, password_pon=password,
                modelo=modelo, marca="VSOL", estado="DISPONIBLE",
                id_recepcion=id_rec, fecha_ingreso=now
            )
            db.add(eq)
            equipos_creados.append(eq)
            existentes.add(serial)

        if not equipos_creados:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Sin equipos válidos para registrar (todos duplicados o vacíos)")

        rec.cantidad = len(equipos_creados)
        rec.cant_ax = cant_ax
        rec.cant_onu = cant_onu
        rec.cant_ac = cant_ac
        
        await db.commit()

        out_equipos = [
            EquipoOut(
                id=e.id,
                serial_pon=e.serial_pon,
                modelo=e.modelo,
                marca=e.marca or "VSOL",
                estado=e.estado or "DISPONIBLE",
                fecha_ingreso=e.fecha_ingreso or now,
                id_recepcion=e.id_recepcion
            ) for e in equipos_creados
        ]

        return RecepcionOut(
            id=id_rec,
            fecha_ingreso=rec.fecha_ingreso or now,
            cantidad=rec.cantidad,
            cant_ax=cant_ax,
            cant_onu=cant_onu,
            cant_ac=cant_ac,
            estado="COMPLETADA",
            equipos=out_equipos
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en recepción: {str(e)}")

@router.get("/stock", response_model=List[EquipoOut])
async def listar_stock(db: AsyncSession = Depends(get_db)):
    stmt = select(Equipo).where(Equipo.estado == "DISPONIBLE")
    res = await db.execute(stmt)
    return [EquipoOut.model_validate(e) for e in res.scalars().all()]

@router.get("/stock/resumen")
async def resumen_stock(db: AsyncSession = Depends(get_db)):
    stmt = select(Equipo.modelo, Equipo.estado, func.count()).group_by(Equipo.modelo, Equipo.estado)
    res = await db.execute(stmt)
    data = {}
    for modelo, estado, cnt in res.all():
        data.setdefault(modelo, {})[estado] = cnt
    return data

@router.get("", response_model=List[EquipoOut])
@router.get("/", response_model=List[EquipoOut])
@router.get("/todos", response_model=List[EquipoOut])
async def listar_todos_equipos(db: AsyncSession = Depends(get_db)):
    stmt = select(Equipo).order_by(Equipo.id.asc())
    res = await db.execute(stmt)
    return [EquipoOut.model_validate(e) for e in res.scalars().all()]

@router.delete("/{serial_o_id}")
async def eliminar_equipo(serial_o_id: str, db: AsyncSession = Depends(get_db)):
    sid = serial_o_id.upper().strip()
    stmt = select(Equipo).where(or_(Equipo.id == sid, Equipo.serial_pon == sid))
    res = await db.execute(stmt)
    eq = res.scalar_one_or_none()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    await db.delete(eq)
    await db.commit()
    return {"status": "success", "message": f"Equipo {sid} eliminado con éxito"}
