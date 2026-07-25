from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

class AuditService:
    @staticmethod
    async def registrar_evento(
        db: AsyncSession,
        entidad: str,
        entidad_id: str,
        accion: str,
        usuario: Optional[str] = "Sistema",
        estado_anterior: Optional[str] = None,
        estado_nuevo: Optional[str] = None,
        detalles: Optional[str] = None
    ):
        try:
            stmt = text("""
                INSERT INTO auditoria_eventos 
                (entidad, entidad_id, accion, estado_anterior, estado_nuevo, usuario, detalles)
                VALUES (:entidad, :entidad_id, :accion, :est_ant, :est_nuev, :usr, :det)
            """)
            await db.execute(stmt, {
                "entidad": entidad.upper(),
                "entidad_id": str(entidad_id).upper(),
                "accion": accion.upper(),
                "est_ant": estado_anterior,
                "est_nuev": estado_nuevo,
                "usr": usuario or "Sistema",
                "det": detalles
            })
            await db.flush()
        except Exception as e:
            print(f"Error registrando auditoría: {e}")

audit_service = AuditService()
