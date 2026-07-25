from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, func
from typing import List
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
    cfg = res.scalar_one()
    cfg.value_int += 1
    await db.commit()
    return f"{prefix}{str(cfg.value_int).zfill(pad)}"

@router.post("/recepcion", response_model=RecepcionOut)
async def recibir_equipos(data: RecepcionIn, db: AsyncSession = Depends(get_db)):
    if not data.equipos or len(data.equipos) > 100:
        raise HTTPException(status_code=400, detail="Lote inválido (1-100)")

    # Verificar duplicados
    seriales_enviados = [e.serial_pon.upper() for e in data.equipos]
    stmt = select(Equipo.serial_pon).where(Equipo.serial_pon.in_(seriales_enviados))
    res = await db.execute(stmt)
    existentes = {r[0] for r in res.all()}

    id_rec = await next_seq(db, "seq_recepcion", "REC_", 3)
    cant_ax = cant_onu = cant_ac = 0
    equipos_creados = []

    for item in data.equipos:
        serial = item.serial_pon.upper()
        modelo = item.modelo.upper()
        if serial in existentes:
            continue
        if modelo == "AX30-H":
            id_eq = await next_seq(db, "seq_eq_ax", "AX_", 3); cant_ax += 1
        elif modelo == "V2801S-B":
            id_eq = await next_seq(db, "seq_eq_onu", "ONU_", 3); cant_onu += 1
        elif modelo == "AC1200":
            id_eq = await next_seq(db, "seq_eq_ac", "AC_", 3); cant_ac += 1
        else:
            continue

        password = serial[4:] if serial.startswith("VSOL") else ""
        eq = Equipo(
            id=id_eq, serial_pon=serial, password_pon=password,
            modelo=modelo, marca="VSOL", estado="DISPONIBLE",
            id_recepcion=id_rec
        )
        db.add(eq)
        equipos_creados.append(eq)
        existentes.add(serial)

    if not equipos_creados:
        raise HTTPException(status_code=400, detail="Sin equipos válidos (todos duplicados o modelo inválido)")

    rec = Recepcion(
        id=id_rec, fecha_ingreso=data.fecha_ingreso or func.now(),
        entrega=data.entrega, recibe=data.recibe,
        firma_entrega=data.firma_entrega, firma_recibe=data.firma_recibe,
        observaciones=data.observaciones,
        cantidad=len(equipos_creados), cant_ax=cant_ax, cant_onu=cant_onu, cant_ac=cant_ac
    )
    db.add(rec)
    await db.commit()

    # Refrescar equipos
    for eq in equipos_creados:
        await db.refresh(eq)

    return RecepcionOut(
        id=id_rec, fecha_ingreso=rec.fecha_ingreso, cantidad=rec.cantidad,
        cant_ax=cant_ax, cant_onu=cant_onu, cant_ac=cant_ac, estado="COMPLETADA",
        equipos=[EquipoOut.model_validate(e) for e in equipos_creados]
    )

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
