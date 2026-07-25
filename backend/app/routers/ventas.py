from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, func
from typing import List
from app.db import get_db
from app.models import Venta, Instalacion, ConfigSystem
from app.schemas import VentaIn, VentaOut, MsgOut
from app.services.telegram_service import tg_service
from app.services.sync_service import sync_service
from app.core.config import get_settings
from app.routers.equipos import next_seq

router = APIRouter(prefix="/ventas", tags=["Ventas"])
settings = get_settings()

def clean_cedula(s: str) -> str:
    if not s: return ""
    return str(s).upper().strip().replace(",", "").replace(" ", "").replace("-", "")

def clean_nombre(s: str) -> str:
    if not s: return ""
    return str(s).upper().strip().replace("  ", " ")

@router.post("/crear", response_model=VentaOut)
async def crear_venta(data: VentaIn, db: AsyncSession = Depends(get_db)):
    # Validar promoción
    promo = (data.promocion or "").strip().upper()
    promos_ok = [p.upper() for p in settings.PROMOS_OK]
    if promo and promo not in promos_ok:
        raise HTTPException(status_code=400, detail="Promoción no válida")

    # Generar ID de venta
    stmt = select(ConfigSystem).where(ConfigSystem.key == "seq_venta").with_for_update()
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()
    if not cfg:
        cfg = ConfigSystem(key="seq_venta", value_int=0)
        db.add(cfg)
    cfg.value_int += 1
    id_venta = f"V_{str(cfg.value_int).zfill(4)}"

    venta = Venta(id_venta=id_venta, **data.model_dump(exclude_unset=True))
    db.add(venta)
    await db.commit()
    await db.refresh(venta)

    # Generar PPPoE automático: VN + NÚMEROS_CÉDULA + - + NÚMERO_SERVICIO
    ced_digits = "".join(filter(str.isdigit, str(venta.cedula_rif or "")))
    num_serv = str(venta.numero_servicio or "1").strip()
    pppoe_auto = f"VN{ced_digits}-{num_serv}" if ced_digits else ""

    # Auto-crear instalación si está aprobada
    if venta.status_venta == "APROBADA":
        prefix_id = "EETL_" if promo == "ESTE ES TU LUGAR" else "INS_"
        seq_key = "seq_eetl" if promo == "ESTE ES TU LUGAR" else "seq_instalacion"
        id_inst = await next_seq(db, seq_key, prefix_id, 3)

        inst = Instalacion(
            id=id_inst, id_venta=venta.id,
            asesor_venta=venta.asesor_venta, promocion=venta.promocion,
            nodo=venta.nodo, nombre_cliente=venta.nombre_cliente,
            tipo_id=venta.tipo_id, cedula_rif=venta.cedula_rif,
            fecha_nacimiento=venta.fecha_nacimiento,
            correo_electronico=venta.correo_electronico,
            nro_contacto=venta.nro_contacto, direccion_exacta=venta.direccion_exacta,
            plan_servicio=venta.plan_servicio, numero_servicio=num_serv,
            pppoe=pppoe_auto, status="PENDIENTE_ASIGNAR"
        )
        db.add(inst)
        venta.id_instalacion = id_inst
        await db.commit()

        msg = (
            f"<b>NUEVA INSTALACION PENDIENTE ({promo or 'ESTÁNDAR'})</b>\n\n"
            f"<b>ID:</b> {id_inst}\n"
            f"<b>Cliente:</b> {venta.nombre_cliente}\n"
            f"<b>PPPoE Sugerido:</b> <code>{pppoe_auto}</code>\n"
            f"<b>Nodo:</b> {venta.nodo or '-'}\n"
            f"<b>Promocion:</b> {venta.promocion or '-'}\n"
            f"<b>Status:</b> PENDIENTE_ASIGNAR\n\n"
            f"<b>Requiere asignacion de equipo.</b>"
        )
        await tg_service.send_message(settings.CHAT_ID, msg, key_notif=f"nueva_{id_inst}", db=db)

    return VentaOut.model_validate(venta)

@router.post("/sincronizar", response_model=MsgOut)
async def sincronizar_ventas(db: AsyncSession = Depends(get_db)):
    stmt = select(Venta).where(Venta.id_instalacion.isnot(None))
    res = await db.execute(stmt)
    ventas = res.scalars().all()
    actualizadas = 0
    for v in ventas:
        stmt_i = select(Instalacion).where(Instalacion.id == v.id_instalacion)
        res_i = await db.execute(stmt_i)
        inst = res_i.scalar_one_or_none()
        if inst and (inst.status != v.status_instalacion or inst.fecha_instalacion != v.fecha_instalacion):
            v.status_instalacion = inst.status
            v.fecha_instalacion = inst.fecha_instalacion
            actualizadas += 1
    await db.commit()
    return MsgOut(status="success", message=f"Sincronizadas {actualizadas} filas en VENTAS")

@router.get("/listar", response_model=List[VentaOut])
async def listar_ventas(db: AsyncSession = Depends(get_db)):
    stmt = select(Venta).order_by(Venta.id.desc())
    res = await db.execute(stmt)
    return [VentaOut.model_validate(v) for v in res.scalars().all()]
