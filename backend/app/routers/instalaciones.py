from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
from datetime import datetime
from app.db import get_db
from app.models import Instalacion, Equipo, Despacho, EquipoCliente, Venta
from app.schemas import (
    InstalacionIn, InstalacionOut, InstalacionUpdate,
    DespachoIn, DespachoOut, ConfiguracionIn, EETLIn, InstaladoIn, MsgOut
)
from app.services.telegram_service import tg_service
from app.services.backup_service import backup_service
from app.services.sync_service import sync_service
from app.core.config import get_settings
from app.routers.equipos import next_seq

router = APIRouter(prefix="/instalaciones", tags=["Instalaciones"])
settings = get_settings()

def esc_xml(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

@router.post("/crear", response_model=InstalacionOut)
async def crear_instalacion(data: InstalacionIn, db: AsyncSession = Depends(get_db)):
    # Detectar duplicados por cédula o nombre
    if data.cedula_rif:
        ced = str(data.cedula_rif).upper().strip().replace(",", "").replace(" ", "")
        stmt = select(Instalacion).where(Instalacion.cedula_rif.ilike(f"%{ced}%"))
        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Cliente con cédula ya existe en instalaciones")

    if data.nombre_cliente:
        nom = str(data.nombre_cliente).upper().strip()
        stmt = select(Instalacion).where(Instalacion.nombre_cliente.ilike(f"%{nom}%"))
        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Cliente con nombre ya existe")

    id_inst = await next_seq(db, "seq_instalacion", "INS_", 3)
    inst = Instalacion(
        id=id_inst, **data.model_dump(exclude_unset=True)
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)

    # Notificar Telegram
    msg = (
        f"<b>NUEVA INSTALACION PENDIENTE</b>\n\n"
        f"<b>ID:</b> {id_inst}\n"
        f"<b>Cliente:</b> {esc_xml(data.nombre_cliente)}\n"
        f"<b>Nodo:</b> {esc_xml(data.nodo)}\n"
        f"<b>Promocion:</b> {esc_xml(data.promocion)}\n"
        f"<b>Status:</b> PENDIENTE_ASIGNAR\n\n"
        f"<b>Requiere asignacion de equipo.</b>"
    )
    await tg_service.send_message(settings.CHAT_ID, msg, key_notif=f"nueva_{id_inst}", db=db)

    return InstalacionOut.model_validate(inst)

@router.post("/despachar", response_model=MsgOut)
async def despachar(data: DespachoIn, db: AsyncSession = Depends(get_db)):
    if not data.id_instalaciones:
        raise HTTPException(status_code=400, detail="No se enviaron IDs")

    ids_upper = [i.upper() for i in data.id_instalaciones]
    stmt = select(Instalacion).where(Instalacion.id.in_(ids_upper))
    res = await db.execute(stmt)
    filas = res.scalars().all()

    if not filas:
        raise HTTPException(status_code=404, detail="Ninguna instalación encontrada")

    procesados = []
    equipos_firmar = []
    for inst in filas:
        inst.status = "EN_RUTA"
        inst.instalador = data.instalador
        procesados.append(inst.id)
        if inst.serial_onu:
            equipos_firmar.append(inst.serial_onu)

    # Actualizar equipos
    if equipos_firmar:
        stmt_eq = update(Equipo).where(Equipo.serial_onu.in_(equipos_firmar)).values(estado="EN_RUTA")
        await db.execute(stmt_eq)

    id_desp = await next_seq(db, "seq_despacho", "DESP_", 3)
    desp = Despacho(
        id=id_desp, instalador=data.instalador,
        firma_instalador=data.firma_instalador,
        cantidad=len(procesados), ids_instalaciones=",".join(procesados),
        observaciones=data.observaciones
    )
    db.add(desp)
    await db.commit()

    return MsgOut(status="success", message=f"Despachados {len(procesados)} equipos en ruta (despacho silencioso)", id=id_desp)

@router.post("/configurar", response_model=MsgOut)
async def configurar(data: ConfiguracionIn, db: AsyncSession = Depends(get_db)):
    stmt = select(Instalacion).where(Instalacion.id == data.id_instalacion.upper())
    res = await db.execute(stmt)
    inst = res.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")

    inst.status = "CONFIGURADO"
    if data.nombre_cliente: inst.nombre_cliente = data.nombre_cliente
    if data.cedula_rif: inst.cedula_rif = data.cedula_rif
    if data.nro_contacto: inst.nro_contacto = data.nro_contacto
    if data.direccion_exacta: inst.direccion_exacta = data.direccion_exacta
    if data.nodo: inst.nodo = data.nodo
    if data.plan_servicio: inst.plan_servicio = data.plan_servicio
    if data.promocion: inst.promocion = data.promocion
    if data.serial_onu: inst.serial_onu = data.serial_onu
    if data.pppoe: inst.pppoe = data.pppoe
    if data.modelo: inst.modelo = data.modelo
    if data.marca: inst.marca = data.marca
    if data.codigo_fibra: inst.codigo_fibra = data.codigo_fibra
    if data.credencial_admin_usuario: inst.credencial_admin_usuario = data.credencial_admin_usuario
    if data.credencial_admin_clave: inst.credencial_admin_clave = data.credencial_admin_clave
    if data.configurado_por: inst.configurado_por = data.configurado_por
    inst.fecha_configuracion = datetime.utcnow()

    # Actualizar equipo
    if data.serial_onu:
        stmt_eq = update(Equipo).where(Equipo.serial_onu == data.serial_onu.upper()).values(estado="CONFIGURADO")
        await db.execute(stmt_eq)

    await db.commit()
    await sync_service.sync_venta_desde_instalacion(db, inst.id, "CONFIGURADO")

    # Enviar ficha Telegram
    msg = (
        f"<b>NUEVA INSTALACION</b>\n"
        f"\n■ <b>NODO:</b> {esc_xml(inst.nodo)}\n"
        f"■ <b>CLIENTE:</b> <code>{esc_xml(inst.nombre_cliente)}</code>\n"
        f"■ <b>CEDULA/RIF:</b> <code>{esc_xml(inst.cedula_rif)}</code>\n"
        f"■ <b>CONTACTO:</b> <code>{esc_xml(inst.nro_contacto)}</code>\n"
        f"■ <b>DIRECCION:</b> <code>{esc_xml(inst.direccion_exacta)}</code>\n"
        f"■ <b>PLAN:</b> {esc_xml(inst.plan_servicio)}\n"
        f"■ <b>PROMOCION:</b> {esc_xml(inst.promocion)}\n"
        f"\n■ <b>PPPoE:</b> <code>{esc_xml(inst.pppoe)}</code>\n"
        f"■ <b>SERIAL PON:</b> <code>{esc_xml(inst.serial_onu)}</code>\n"
        f"■ <b>MARCA / MODELO:</b> {esc_xml((inst.marca or '') + ' ' + (inst.modelo or ''))}\n"
        f"\n👤 <b>Configurado por:</b> {esc_xml(inst.configurado_por)}\n"
        f"📅 <b>Fecha:</b> {datetime.utcnow().strftime('%d/%m/%Y')}"
    )
    reply = {"inline_keyboard": [[{"text": "SOLICITAR REGISTRO 📋", "callback_data": f"reenviar_{inst.id}"}]]}
    await tg_service.send_message(settings.CHAT_ID, msg, reply_markup=reply, key_notif=f"ficha_{inst.id}", db=db)

    # Generar backup si es AX y tiene PPPoE + Serial
    mod_up = (inst.modelo or "").upper()
    if inst.pppoe and inst.serial_onu and ("AX" in mod_up or not mod_up or "ROUTER" in mod_up):
        # Aquí deberías leer la plantilla XML de Supabase Storage o local
        # Por ahora retornamos indicación
        pass

    return MsgOut(status="success", message="Instalación configurada", id=inst.id)

@router.post("/eetl", response_model=MsgOut)
async def procesar_eetl(data: EETLIn, db: AsyncSession = Depends(get_db)):
    id_target = data.id_instalacion.upper()
    fecha_fmt = data.fecha_instalacion.strftime("%d/%m/%Y") if data.fecha_instalacion else datetime.utcnow().strftime("%d/%m/%Y")
    instalador = data.instalado_por or "Técnico"

    # Actualizar venta si existe
    stmt_v = select(Venta).where(Venta.id_instalacion == id_target)
    res_v = await db.execute(stmt_v)
    venta = res_v.scalar_one_or_none()
    if venta:
        venta.status_instalacion = "INSTALADO"
        venta.fecha_instalacion = data.fecha_instalacion or datetime.utcnow()

    # Upsert en equipos_cliente
    stmt_ec = select(EquipoCliente).where(EquipoCliente.id_instalacion == id_target)
    res_ec = await db.execute(stmt_ec)
    ec = res_ec.scalar_one_or_none()

    vals = {
        "serial_pon": data.serial_pon, "marca": data.marca, "modelo": data.modelo,
        "nombre_cliente": data.nombre_cliente, "cedula_rif": data.cedula_rif,
        "fecha_instalacion": data.fecha_instalacion or datetime.utcnow(),
        "instalador": instalador, "pppoe": data.pppoe,
        "credencial_admin_usuario": data.credencial_admin_usuario,
        "credencial_admin_clave": data.credencial_admin_clave,
        "nodo": data.nodo, "nro_contacto": data.nro_contacto,
        "direccion": data.direccion, "plan": data.plan,
        "codigo_fibra": data.codigo_fibra
    }
    if ec:
        for k, v in vals.items():
            if v is not None:
                setattr(ec, k, v)
    else:
        id_eqc = await next_seq(db, "seq_eqc", "EQC_", 3)
        ec = EquipoCliente(id=id_eqc, id_instalacion=id_target, **vals)
        db.add(ec)

    await db.commit()

    # Notificar Telegram
    ced_fmt = f"{data.tipo_id or 'V'}-{data.cedula_rif}" if data.cedula_rif else "-"
    msg = (
        f"📡 <b>MIGRACIÓN DE SERVICIO (EQUIPO PROPIO)</b>\n\n"
        f"■ <b>ID:</b> {esc_xml(id_target)}\n"
        f"■ <b>NODO:</b> {esc_xml(data.nodo or '-')}\n"
        f"■ <b>CLIENTE:</b> <code>{esc_xml(data.nombre_cliente or '-')}</code>\n"
        f"■ <b>CEDULA/RIF:</b> <code>{esc_xml(ced_fmt)}</code>\n"
        f"■ <b>CONTACTO:</b> <code>{esc_xml(data.nro_contacto or '-')}</code>\n"
        f"■ <b>DIRECCION:</b> <code>{esc_xml(data.direccion or '-')}</code>\n"
        f"■ <b>PLAN:</b> {esc_xml(data.plan or '-')}\n"
        f"■ <b>PROMOCION:</b> ESTE ES TU LUGAR\n"
        f"\n■ <b>PPPoE:</b> <code>{esc_xml(data.pppoe or '-')}</code>\n"
        f"■ <b>SERIAL PON:</b> <code>{esc_xml(data.serial_pon or '-')}</code>\n"
        f"■ <b>MARCA / MODELO:</b> {esc_xml((data.marca or '') + ' ' + (data.modelo or ''))}\n"
        f"■ <b>CODIGO FIBRA:</b> <code>{esc_xml(data.codigo_fibra or '-')}</code>\n"
        f"\n👤 <b>Instalado por:</b> {esc_xml(instalador)}\n"
        f"📅 <b>Fecha:</b> {fecha_fmt}"
    )
    reply = {"inline_keyboard": [[{"text": "SOLICITAR REGISTRO 📋", "callback_data": f"reenviar_{id_target}"}]]}
    await tg_service.send_message(settings.CHAT_ID, msg, reply_markup=reply, key_notif=f"eetl_card_{id_target}", db=db)

    return MsgOut(status="success", message="Instalación EETL completada", id=id_target)

@router.post("/instalado", response_model=MsgOut)
async def marcar_instalado(data: InstaladoIn, db: AsyncSession = Depends(get_db)):
    id_inst = data.id_instalacion.upper()
    stmt = select(Instalacion).where(Instalacion.id == id_inst)
    res = await db.execute(stmt)
    inst = res.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")

    if inst.status == "INSTALADO":
        return MsgOut(status="success", message="Ya estaba INSTALADO", id=id_inst)

    fecha = data.fecha_instalacion or datetime.utcnow().date()
    inst.status = "INSTALADO"
    inst.fecha_instalacion = fecha
    inst.instalador = data.instalado_por

    # Actualizar equipo
    if inst.serial_onu:
        stmt_eq = update(Equipo).where(Equipo.serial_onu == inst.serial_onu.upper()).values(estado="INSTALADO")
        await db.execute(stmt_eq)

    await db.commit()
    await sync_service.sync_venta_desde_instalacion(db, id_inst, "INSTALADO", fecha)

    msg = (
        f"✅ <b>INSTALACION CONFIRMADA</b>\n\n"
        f"🆔 <b>ID:</b> {id_inst}\n"
        f"👤 <b>Cliente:</b> {esc_xml(inst.nombre_cliente)}\n"
        f"📅 <b>Fecha:</b> {fecha.strftime('%d/%m/%Y')}\n"
        f"👨‍🔧 <b>Por:</b> {esc_xml(data.instalado_por)}\n"
        f"🔌 <b>Equipo:</b> {inst.id} | {esc_xml(inst.serial_onu or 'N/A')}"
    )
    await tg_service.send_message(settings.CHAT_ID, msg, key_notif=f"conf_main_{id_inst}", db=db)
    if settings.CHAT_REENVIO_ID and settings.CHAT_REENVIO_ID != settings.CHAT_ID:
        await tg_service.send_message(settings.CHAT_REENVIO_ID, msg, key_notif=f"conf_reenvio_{id_inst}", db=db)

    return MsgOut(status="success", message="Marcado como INSTALADO correctamente", id=id_inst)

@router.get("/pendientes", response_model=List[InstalacionOut])
async def listar_pendientes(db: AsyncSession = Depends(get_db)):
    stmt = select(Instalacion).where(Instalacion.status.in_(["PENDIENTE_ASIGNAR", "CONFIGURADO", "EN_RUTA"]))
    res = await db.execute(stmt)
    return [InstalacionOut.model_validate(i) for i in res.scalars().all()]
