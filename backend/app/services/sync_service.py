from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models import Venta, Instalacion

class SyncService:
    async def sync_venta_desde_instalacion(self, db: AsyncSession, id_instalacion: str, nuevo_estado: str, fecha_instalacion=None):
        stmt = select(Venta).where(Venta.id_instalacion == id_instalacion)
        res = await db.execute(stmt)
        venta = res.scalar_one_or_none()
        if venta:
            venta.status_instalacion = nuevo_estado
            if fecha_instalacion:
                venta.fecha_instalacion = fecha_instalacion
            await db.commit()

    async def sync_instalacion_desde_venta(self, db: AsyncSession, venta_id: int, id_instalacion: str):
        stmt = update(Venta).where(Venta.id == venta_id).values(id_instalacion=id_instalacion)
        await db.execute(stmt)
        await db.commit()

sync_service = SyncService()
