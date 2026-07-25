import re
from app.core.config import get_settings

settings = get_settings()

class BackupService:
    PLANTILLA_NOMBRE = "BACKUP_AX30-H_BASE.xml"

    def generar_xml(self, pppoe: str, nombre_cliente: str, id_instalacion: str, serial_onu: str, plantilla_xml: str) -> tuple[str, str]:
        """Retorna (file_name, xml_content)"""
        if not pppoe or not serial_onu:
            raise ValueError("Falta PPPoE o Serial")

        xml = plantilla_xml
        # Reemplazar credenciales PPPoE en el bloque WAN
        def replacer(bloque):
            bloque = re.sub(
                r'<Value Name="aucUsername" Value="[^"]*"/>',
                f'<Value Name="aucUsername" Value="{self._esc(pppoe)}"/>',
                bloque
            )
            bloque = re.sub(
                r'<Value Name="aucPassword" Value="[^"]*"/>',
                f'<Value Name="aucPassword" Value="{self._esc(pppoe)}"/>',
                bloque
            )
            return bloque

        xml = re.sub(r'(<Dir Name="WAN_CONNECTION_ATTR_TAB">[\s\S]*?</Dir>)', replacer, xml)

        safe = re.sub(r"[^a-zA-Z0-9\s]", "", nombre_cliente or "").strip().replace(" ", "_")
        file_name = f"BACKUP_{serial_onu}_{safe or id_instalacion}.xml"
        return file_name, xml

    @staticmethod
    def _esc(s: str) -> str:
        return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

backup_service = BackupService()
