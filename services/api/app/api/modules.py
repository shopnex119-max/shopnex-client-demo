from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.zatca import DEFAULT_COMPANY_ID, _company
from app.core.auth import require_admin, require_user
from app.db.models import ModuleRecord, User
from app.db.session import get_db

ModuleName = Literal["restaurant", "crm", "hr"]
router = APIRouter(prefix="/modules", tags=["Business modules"], dependencies=[Depends(require_user)])


class ModuleRecordInput(BaseModel):
    data: dict[str, Any] = Field(min_length=1, max_length=30)


class ModuleRecordOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    module: str
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


def _required_text(data: dict[str, Any], key: str, maximum: int = 200) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=422, detail=f"{key} is required")
    result = value.strip()
    if len(result) > maximum:
        raise HTTPException(status_code=422, detail=f"{key} is too long")
    return result


def _optional_text(data: dict[str, Any], key: str, maximum: int = 200) -> str:
    value = data.get(key, "")
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=f"{key} must be text")
    result = value.strip()
    if len(result) > maximum:
        raise HTTPException(status_code=422, detail=f"{key} is too long")
    return result


def _money(value: Any, key: str) -> str:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=422, detail=f"{key} must be a valid amount") from None
    if not amount.is_finite() or amount < 0 or amount > Decimal("999999999999.99"):
        raise HTTPException(status_code=422, detail=f"{key} is outside the allowed range")
    return str(amount.quantize(Decimal("0.01")))


def _validated(module: str, raw: dict[str, Any]) -> dict[str, Any]:
    data = dict(raw)
    if module == "restaurant":
        kind = data.get("type")
        if kind == "table":
            seats = data.get("seats")
            try:
                seats = int(seats)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="seats must be a positive integer") from None
            if seats < 1 or seats > 100:
                raise HTTPException(status_code=422, detail="seats must be between 1 and 100")
            status = data.get("status", "available")
            if status not in {"available", "occupied"}:
                raise HTTPException(status_code=422, detail="Invalid table status")
            return {"type": "table", "name": _required_text(data, "name"), "seats": seats, "status": status}
        if kind == "order":
            status = data.get("status", "new")
            if status not in {"new", "preparing", "ready", "served", "cancelled"}:
                raise HTTPException(status_code=422, detail="Invalid order status")
            return {"type": "order", "name": _required_text(data, "name"), "location": _required_text(data, "location"),
                    "amount": _money(data.get("amount", 0), "amount"), "status": status}
        raise HTTPException(status_code=422, detail="Restaurant record type must be order or table")

    if module == "crm":
        segment = data.get("segment", "new")
        if segment not in {"new", "regular", "vip"}:
            raise HTTPException(status_code=422, detail="Invalid customer segment")
        try:
            points = int(data.get("points", 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="points must be a non-negative integer") from None
        if points < 0 or points > 2_000_000_000:
            raise HTTPException(status_code=422, detail="points are outside the allowed range")
        return {"name": _required_text(data, "name"), "phone": _required_text(data, "phone", 40),
                "email": _optional_text(data, "email", 240), "segment": segment, "points": points,
                "total_spend": _money(data.get("total_spend", 0), "total_spend")}

    if module == "hr":
        status = data.get("status", "active")
        if status not in {"active", "on_leave", "inactive"}:
            raise HTTPException(status_code=422, detail="Invalid employee status")
        return {"name": _required_text(data, "name"), "role": _required_text(data, "role"),
                "department": _required_text(data, "department"), "phone": _optional_text(data, "phone", 40), "status": status}

    raise HTTPException(status_code=404, detail="Unknown business module")


def _record_or_404(db: Session, module: str, record_id: str) -> ModuleRecord:
    try:
        UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Record not found") from None
    row = db.scalar(select(ModuleRecord).where(
        ModuleRecord.id == record_id,
        ModuleRecord.company_id == DEFAULT_COMPANY_ID,
        ModuleRecord.module == module,
    ))
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


@router.get("/{module}/records", response_model=list[ModuleRecordOutput])
def list_records(module: ModuleName, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    return db.scalars(select(ModuleRecord).where(
        ModuleRecord.company_id == company.id, ModuleRecord.module == module,
    ).order_by(ModuleRecord.created_at.desc())).all()


@router.post("/{module}/records", response_model=ModuleRecordOutput, status_code=201)
def create_record(module: ModuleName, payload: ModuleRecordInput, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    record = ModuleRecord(company_id=company.id, module=module, data=_validated(module, payload.data))
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{module}/records/{record_id}", response_model=ModuleRecordOutput)
def update_record(module: ModuleName, record_id: str, payload: ModuleRecordInput, db: Session = Depends(get_db), _user: User = Depends(require_admin)):
    record = _record_or_404(db, module, record_id)
    record.data = _validated(module, payload.data)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{module}/records/{record_id}", status_code=204)
def delete_record(module: ModuleName, record_id: str, db: Session = Depends(get_db), _user: User = Depends(require_admin)):
    record = _record_or_404(db, module, record_id)
    db.delete(record)
    db.commit()
    return None
