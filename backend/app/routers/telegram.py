from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.services.telegram_service import tg_service
from app.services.sync_service import sync_service
from app.models import Instalacion
from app.core.config import get_settings

router = APIRouter(prefix="/telegram", tags=["Telegram"])
settings = get_settings()

@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()

    message = data.get("message")
    callback = data.get("callback_query")

    if message and message.get("text", "").startswith("/"):
        await procesar_comando(message, db)
    elif callback:
        await procesar_callback(callback, db)

    return {"ok": True}

async def procesar_comando(msg, db):
    text = msg.get("text", "").strip()
    chat = msg["chat"]["id"]
    tokens = text.split()
    cmd = tokens[0].lower().split("@")[0]

    if cmd in ["/ayuda", "/start"]:
        await tg_service.send_message(chat, 
            "<b>COMANDOS UMSR</b>\n\n"
            "<b>/instalado ID [DD/MM/YYYY]</b>\nMarca instalación como completada.\n"
            "<b>/pendientes</b>\nLista instalaciones pendientes.\n"
            "<b>/stock</b>\nMuestra equipos disponibles.\n"
            "<b>/ayuda</b>\nMuestra este mensaje.")
        return

    if cmd == "/pendientes":
        stmt = select(Instalacion).where(Instalacion.status.in_(["PENDIENTE_ASIGNAR", "CONFIGURADO", "EN_RUTA"]))
        res = await db.execute(stmt)
        filas = res.scalars().all()
        if not filas:
            await tg_service.send_message(chat, "Sin pendientes")
            return
        lines = [f"• {i.id} | {i.nombre_cliente} | {i.nodo}" for i in filas]
        await tg_service.send_message(chat, f"<b>PENDIENTES ({len(filas)})</b>\n\n" + "\n".join(lines))
        return

    if cmd == "/stock":
        from sqlalchemy import func
        from app.models import Equipo
        stmt = select(Equipo.modelo, Equipo.estado, func.count()).group_by(Equipo.modelo, Equipo.estado)
        res = await db.execute(stmt)
        data = {}
        for modelo, estado, cnt in res.all():
            data.setdefault(modelo, {})[estado] = cnt
        msg_text = "<b>STOCK DE EQUIPOS</b>\n\n"
        for mod in ["AX30-H", "V2801S-B", "AC1200"]:
            d = data.get(mod, {})
            msg_text += f"<b>{mod}:</b> {d.get('DISPONIBLE',0)} disp | {d.get('ASIGNADO',0)} asig | {d.get('CONFIGURADO',0)} conf | {d.get('EN_RUTA',0)} ruta | {d.get('INSTALADO',0)} inst\n"
        await tg_service.send_message(chat, msg_text)
        return

    if cmd == "/instalado":
        if len(tokens) < 2:
            await tg_service.send_message(chat, "Formato: <code>/instalado INS_001 [DD/MM/YYYY]</code>")
            return
        id_inst = tokens[1].upper()
        from datetime import datetime
        fecha = datetime.strptime(tokens[2], "%d/%m/%Y").date() if len(tokens) > 2 else datetime.utcnow().date()
        nombre = msg.get("from", {}).get("first_name") or msg.get("from", {}).get("username") or "Técnico"

        from app.routers.instalaciones import marcar_instalado, InstaladoIn
        # Llamar directamente al servicio
        stmt = select(Instalacion).where(Instalacion.id == id_inst)
        res = await db.execute(stmt)
        inst = res.scalar_one_or_none()
        if not inst:
            await tg_service.send_message(chat, f"No encontrado: {id_inst}")
            return
        if inst.status == "INSTALADO":
            await tg_service.send_message(chat, "Ya estaba INSTALADO")
            return
        inst.status = "INSTALADO"
        inst.fecha_instalacion = fecha
        inst.instalador = nombre
        await db.commit()
        await sync_service.sync_venta_desde_instalacion(db, id_inst, "INSTALADO", fecha)
        await tg_service.send_message(chat, 
            f"✅ <b>INSTALACION CONFIRMADA</b>\n\n🆔 <b>ID:</b> {id_inst}\n👤 <b>Cliente:</b> {inst.nombre_cliente}\n📅 <b>Fecha:</b> {fecha.strftime('%d/%m/%Y')}\n👨‍🔧 <b>Por:</b> {nombre}",
            key_notif=f"conf_main_{id_inst}", db=db)
        return

async def procesar_callback(cb, db):
    data = cb.get("data", "")
    if not data.startswith("reenviar_"):
        return
    id_inst = data[9:]
    chat_dest = settings.CHAT_REENVIO_ID
    if not chat_dest:
        await tg_service.answer_callback(cb["id"], "CHAT_REENVIO_ID no configurado", True)
        return

    stmt = select(Instalacion).where(Instalacion.id == id_inst)
    res = await db.execute(stmt)
    inst = res.scalar_one_or_none()
    if not inst:
        await tg_service.answer_callback(cb["id"], f"No se hallaron datos de {id_inst}", True)
        return

    msg = (
        f"<b>NUEVA INSTALACION</b>\n"
        f"\n■ <b>NODO:</b> {inst.nodo or '-'}\n"
        f"■ <b>CLIENTE:</b> <code>{inst.nombre_cliente or '-'}</code>\n"
        f"■ <b>PPPoE:</b> <code>{inst.pppoe or '-'}</code>\n"
        f"■ <b>SERIAL:</b> <code>{inst.serial_onu or '-'}</code>"
    )
    await tg_service.send_message(chat_dest, msg, key_notif=f"reenvio_{id_inst}", db=db)
    await tg_service.answer_callback(cb["id"], "Solicitud enviada con éxito.", False)
