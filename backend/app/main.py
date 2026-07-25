from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import equipos, instalaciones, ventas, telegram

app = FastAPI(
    title="UMSR API",
    description="Backend migrado desde Apps Script - GESTOR VN",
    version="2.0.0"
)

# CORS para PWA en Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción restringir al dominio de Vercel
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(equipos.router)
app.include_router(instalaciones.router)
app.include_router(ventas.router)
app.include_router(telegram.router)

@app.get("/")
async def root():
    return {"status": "UMSR API Activa v2.0", "source": "Migrado desde Apps Script v7.8"}

@app.get("/health")
async def health():
    return {"status": "ok"}
