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

class CrearUsuarioIn(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str

class EditarUsuarioIn(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None

@router.get("/usuarios")
async def listar_usuarios(db: AsyncSession = Depends(get_db)):
    try:
        stmt = text("SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY id ASC")
        res = await db.execute(stmt)
        rows = res.fetchall()
        return [
            {
                "id": str(r[0]),
                "nombre": str(r[1]),
                "email": str(r[2]),
                "rol": str(r[3]),
                "activo": bool(r[4]) if r[4] is not None else True,
                "created_at": str(r[5]) if r[5] else None
            } for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo usuarios: {str(e)}")

@router.post("/usuarios")
async def crear_usuario(data: CrearUsuarioIn, db: AsyncSession = Depends(get_db)):
    pwd_hash = hash_password(data.password)
    email_clean = data.email.strip().lower()
    
    stmt_check = text("SELECT id FROM usuarios WHERE LOWER(email) = :email")
    res_check = await db.execute(stmt_check, {"email": email_clean})
    if res_check.fetchone():
        raise HTTPException(status_code=400, detail="El correo ya se encuentra registrado")
    
    stmt_count = text("SELECT COUNT(*) FROM usuarios")
    res_count = await db.execute(stmt_count)
    cnt = (res_count.scalar() or 0) + 1
    new_id = f"user_{cnt}"
    
    try:
        stmt_ins = text("INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo) VALUES (:id, :nombre, :email, :pwd, :rol, true)")
        await db.execute(stmt_ins, {
            "id": new_id,
            "nombre": data.nombre.strip(),
            "email": email_clean,
            "pwd": pwd_hash,
            "rol": data.rol.upper().strip()
        })
        await db.commit()
        return {"status": "success", "message": f"Usuario {data.nombre} creado con rol {data.rol}"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando usuario: {str(e)}")

@router.put("/usuarios/{user_id}")
async def editar_usuario(user_id: str, data: EditarUsuarioIn, db: AsyncSession = Depends(get_db)):
    stmt = text("SELECT id, nombre, email, rol, activo FROM usuarios WHERE CAST(id AS TEXT) = :user_id")
    res = await db.execute(stmt, {"user_id": str(user_id)})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fields = []
    params = {"user_id": str(user_id)}

    if data.nombre is not None:
        fields.append("nombre = :nombre")
        params["nombre"] = data.nombre.strip()

    if data.email is not None:
        fields.append("email = :email")
        params["email"] = data.email.strip().lower()

    if data.rol is not None:
        fields.append("rol = :rol")
        params["rol"] = data.rol.upper().strip()

    if data.activo is not None:
        fields.append("activo = :activo")
        params["activo"] = data.activo

    if data.password and data.password.strip():
        fields.append("password_hash = :pwd")
        params["pwd"] = hash_password(data.password.strip())

    if fields:
        sql = f"UPDATE usuarios SET {', '.join(fields)} WHERE CAST(id AS TEXT) = :user_id"
        await db.execute(text(sql), params)
        await db.commit()

    return {"status": "success", "message": f"Usuario {user_id} actualizado con éxito"}

@router.delete("/usuarios/{user_id}")
async def eliminar_usuario(user_id: str, db: AsyncSession = Depends(get_db)):
    stmt = text("DELETE FROM usuarios WHERE CAST(id AS TEXT) = :user_id")
    await db.execute(stmt, {"user_id": str(user_id)})
    await db.commit()
    return {"status": "success", "message": f"Usuario {user_id} eliminado"}
