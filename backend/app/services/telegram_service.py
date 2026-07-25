import httpx
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from app.core.config import get_settings
from app.models import TelegramLog

settings = get_settings()

class TelegramService:
    BASE = f"https://api.telegram.org/bot{settings.BOT_TOKEN}"

    async def send_message(self, chat_id: str, text: str, reply_markup=None, key_notif: str = None, db: AsyncSession = None):
        if not settings.BOT_TOKEN or not chat_id:
            return False

        # Deduplicación (5 min)
        if key_notif and db:
            stmt = select(TelegramLog).where(TelegramLog.key_notif == key_notif)
            res = await db.execute(stmt)
            log = res.scalar_one_or_none()
            if log and (datetime.utcnow() - log.sent_at) < timedelta(minutes=5):
                return False

        payload = {
            "chat_id": str(chat_id),
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        async with httpx.AsyncClient() as client:
            r = await client.post(f"{self.BASE}/sendMessage", json=payload)
            data = r.json()

        if data.get("ok") and key_notif and db:
            await db.execute(insert(TelegramLog).values(key_notif=key_notif, sent_at=datetime.utcnow()))
            await db.commit()
        return data.get("ok", False)

    async def send_document(self, chat_id: str, file_name: str, content: bytes, caption: str = "", key_notif: str = None, db: AsyncSession = None):
        if not settings.BOT_TOKEN or not chat_id:
            return False

        if key_notif and db:
            stmt = select(TelegramLog).where(TelegramLog.key_notif == key_notif)
            res = await db.execute(stmt)
            log = res.scalar_one_or_none()
            if log and (datetime.utcnow() - log.sent_at) < timedelta(minutes=5):
                return False

        async with httpx.AsyncClient() as client:
            files = {"document": (file_name, content, "application/xml")}
            data = {"chat_id": str(chat_id), "caption": caption, "parse_mode": "HTML"}
            r = await client.post(f"{self.BASE}/sendDocument", data=data, files=files)
            data = r.json()

        if data.get("ok") and key_notif and db:
            await db.execute(insert(TelegramLog).values(key_notif=key_notif, sent_at=datetime.utcnow()))
            await db.commit()
        return data.get("ok", False)

    async def answer_callback(self, callback_query_id: str, text: str, show_alert: bool = False):
        if not settings.BOT_TOKEN:
            return
        payload = {"callback_query_id": callback_query_id, "text": text, "show_alert": show_alert}
        async with httpx.AsyncClient() as client:
            await client.post(f"{self.BASE}/answerCallbackQuery", json=payload)

tg_service = TelegramService()
