from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, List, Dict, Any
from app.db import get_db
from app.models import Equipo, Recepcion, Venta, Instalacion, EquipoCliente, Despacho

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Trazabilidad"])

@router.get("/stats")
async def obtener_estadisticas(db: AsyncSession = Depends(get_db)):
    # Stock disponible
    res_stock = await db.execute(select(func.count()).select_from(Equipo).where(Equipo.estado == "DISPONIBLE"))
    stock_disponible = res_stock.scalar() or 0

    # Stock en ruta / configurado / instalado
    res_enruta = await db.execute(select(func.count()).select_from(Equipo).where(Equipo.estado == "EN_RUTA"))
    en_ruta = res_enruta.scalar() or 0

    # Ventas totales
    res_ventas = await db.execute(select(func.count()).select_from(Venta))
    total_ventas = res_ventas.scalar() or 0

    # Instalaciones pendientes / configuradas
    res_inst_pend = await db.execute(select(func.count()).select_from(Instalacion).where(Instalacion.status.in_(["PENDIENTE_ASIGNAR", "CONFIGURADO"])))
    inst_pendientes = res_inst_pend.scalar() or 0

    # Instalaciones completadas
    res_inst_comp = await db.execute(select(func.count()).select_from(Instalacion).where(Instalacion.status == "INSTALADO"))
    inst_completadas = res_inst_comp.scalar() or 0

    # EETL / Equipos Cliente
    res_eetl = await db.execute(select(func.count()).select_from(EquipoCliente))
    total_eetl = res_eetl.scalar() or 0

    # Desglose de equipos por modelo
    stmt_mod = select(Equipo.modelo, func.count()).group_by(Equipo.modelo)
    res_mod = await db.execute(stmt_mod)
    modelos_count = {row[0]: row[1] for row in res_mod.all()}

    return {
        "stock_disponible": stock_disponible,
        "equipos_en_ruta": en_ruta,
        "total_ventas": total_ventas,
        "instalaciones_pendientes": inst_pendientes,
        "instalaciones_completadas": inst_completadas,
        "total_eetl": total_eetl,
        "desglose_modelos": modelos_count
    }

@router.get("/trazabilidad")
async def buscar_trazabilidad(query: str = Query(..., min_length=2), db: AsyncSession = Depends(get_db)):
    q = f"%{query.strip().upper()}%"
    
    # 1. Buscar en Equipos
    stmt_eq = select(Equipo).where(
        or_(
            Equipo.serial_pon.ilike(q),
            Equipo.id.ilike(q),
            Equipo.id_recepcion.ilike(q),
            Equipo.id_instalacion.ilike(q)
        )
    )
    res_eq = await db.execute(stmt_eq)
    equipos = res_eq.scalars().all()

    # 2. Buscar en Ventas
    stmt_v = select(Venta).where(
        or_(
            Venta.nombre_cliente.ilike(q),
            Venta.cedula_rif.ilike(q),
            Venta.id_venta.ilike(q),
            Venta.id_instalacion.ilike(q)
        )
    )
    res_v = await db.execute(stmt_v)
    ventas = res_v.scalars().all()

    # 3. Buscar en Instalaciones
    stmt_i = select(Instalacion).where(
        or_(
            Instalacion.nombre_cliente.ilike(q),
            Instalacion.cedula_rif.ilike(q),
            Instalacion.id.ilike(q),
            Instalacion.serial_onu.ilike(q),
            Instalacion.pppoe.ilike(q)
        )
    )
    res_i = await db.execute(stmt_i)
    instalaciones = res_i.scalars().all()

    # 4. Buscar en Equipos Cliente (EETL)
    stmt_e = select(EquipoCliente).where(
        or_(
            EquipoCliente.nombre_cliente.ilike(q),
            EquipoCliente.cedula_rif.ilike(q),
            EquipoCliente.serial_pon.ilike(q),
            EquipoCliente.id_instalacion.ilike(q)
        )
    )
    res_e = await db.execute(stmt_e)
    equipos_cliente = res_e.scalars().all()

    return {
        "query": query,
        "equipos": [
            {
                "id": e.id, "serial_pon": e.serial_pon, "modelo": e.modelo,
                "estado": e.estado, "fecha_ingreso": e.fecha_ingreso,
                "id_recepcion": e.id_recepcion, "id_instalacion": e.id_instalacion
            } for e in equipos
        ],
        "ventas": [
            {
                "id_venta": v.id_venta, "cliente": v.nombre_cliente,
                "cedula_rif": v.cedula_rif, "asesor": v.asesor_venta,
                "status_venta": v.status_venta, "status_instalacion": v.status_instalacion,
                "fecha_venta": v.fecha_venta, "id_instalacion": v.id_instalacion
            } for v in ventas
        ],
        "instalaciones": [
            {
                "id": i.id, "cliente": i.nombre_cliente, "cedula_rif": i.cedula_rif,
                "nodo": i.nodo, "plan": i.plan_servicio, "status": i.status,
                "serial_onu": i.serial_onu, "pppoe": i.pppoe, "instalador": i.instalador,
                "fecha_instalacion": i.fecha_instalacion
            } for i in instalaciones
        ],
        "equipos_cliente": [
            {
                "id": ec.id, "cliente": ec.nombre_cliente, "cedula_rif": ec.cedula_rif,
                "serial_pon": ec.serial_pon, "modelo": ec.modelo, "nodo": ec.nodo,
                "instalador": ec.instalador, "fecha_instalacion": ec.fecha_instalacion
            } for ec in equipos_cliente
        ]
    }
