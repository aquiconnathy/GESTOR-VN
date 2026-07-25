import hashlib
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.db import get_db
from app.models import Usuario

router = APIRouter(prefix="/auth", tags=["Auth"])

class LoginIn(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    nombre: str
    email: str
    rol: str
    token: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

@router.post("/login", response_model=UserOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    pwd_hash = hash_password(data.password)
    stmt = select(Usuario).where(Usuario.email == data.email.strip().lower(), Usuario.activo == True)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or user.password_hash != pwd_hash:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Token simple para sesión (en producción usar JWT sign)
    token = f"token_{user.id}_{user.rol}"

    return UserOut(
        id=str(user.id),
        nombre=user.nombre,
        email=user.email,
        rol=user.rol,
        token=token
    )

@router.get("/me", response_model=UserOut)
async def me(authorization: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado")
    token = authorization.split(" ")[1]
    parts = token.split("_")
    if len(parts) < 3:
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = parts[1]
    stmt = select(Usuario).where(Usuario.id == user_id, Usuario.activo == True)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return UserOut(
        id=str(user.id),
        nombre=user.nombre,
        email=user.email,
        rol=user.rol,
        token=token
    )
