import hashlib
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from app.db import get_db

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
    email_clean = data.email.strip().lower()

    try:
        stmt = text("SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE LOWER(email) = :email")
        res = await db.execute(stmt, {"email": email_clean})
        row = res.fetchone()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error DB: {str(e)}")

    if not row:
        raise HTTPException(status_code=401, detail="Usuario no encontrado en la base de datos")

    user_id, nombre, email, db_pwd_hash, rol = row[0], row[1], row[2], row[3], row[4]

    db_pwd_hash_clean = (str(db_pwd_hash) if db_pwd_hash else "").strip().strip('"').strip("'")
    pwd_clean = data.password.strip()

    # Permitir hash SHA-256, texto plano o clave demo universal 'admin123'
    is_valid = (
        db_pwd_hash_clean.lower() == pwd_hash.lower() or
        db_pwd_hash_clean.lower() == pwd_clean.lower() or
        pwd_clean == "admin123"
    )

    if not is_valid:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    token = f"token_{user_id}_{rol}"

    return UserOut(
        id=str(user_id),
        nombre=str(nombre),
        email=str(email),
        rol=str(rol),
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
    
    try:
        stmt = text("SELECT id, nombre, email, rol FROM usuarios WHERE CAST(id AS TEXT) = :user_id")
        res = await db.execute(stmt, {"user_id": str(user_id)})
        row = res.fetchone()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error DB: {str(e)}")

    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return UserOut(
        id=str(row[0]),
        nombre=str(row[1]),
        email=str(row[2]),
        rol=str(row[3]),
        token=token
    )
