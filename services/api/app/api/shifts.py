"""Cashier shifts: opening float, cash in/out, blind close with counted cash and variance."""
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.zatca import _company
from app.core.auth import require_user
from app.core.permissions import permission_granted
from app.db.models import CashMovement, Invoice, InvoicePayment, Shift, User, utcnow
from app.db.session import get_db
from app.financial import ZERO, money
from app.numbering import SHIFT_SERIES, allocate_number

router = APIRouter(prefix="/shifts", tags=["Cashier shifts"], dependencies=[Depends(require_user)])


class OpenShiftInput(BaseModel):
    opening_float: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)


class CashMovementInput(BaseModel):
    movement_type: str = Field(pattern="^(cash_in|cash_out)$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=3, max_length=240)


class CloseShiftInput(BaseModel):
    counted_cash: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    notes: str = Field(default="", max_length=1000)


def _dec(value) -> Decimal:
    return Decimal(str(value)) if value is not None else ZERO


def _is_manager(user: User) -> bool:
    return permission_granted(user, "reports.view")


def _totals(db: Session, shift: Shift) -> dict:
    invoices = db.scalars(
        select(Invoice).where(Invoice.shift_id == shift.id).order_by(Invoice.sequence_number, Invoice.created_at)
    ).all()
    ids = [row.id for row in invoices]
    payments = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id.in_(ids))).all() if ids else []
    by_method: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for payment in payments:
        by_method[payment.method] += _dec(payment.amount)
    movements = db.scalars(
        select(CashMovement).where(CashMovement.shift_id == shift.id).order_by(CashMovement.created_at)
    ).all()
    cash_in = sum((_dec(m.amount) for m in movements if m.movement_type == "cash_in"), ZERO)
    cash_out = sum((_dec(m.amount) for m in movements if m.movement_type == "cash_out"), ZERO)
    cash_sales = by_method.get("cash", ZERO)
    # InvoicePayment stores the applied amount (change already deducted), so no second subtraction.
    expected = money(_dec(shift.opening_float) + cash_sales + cash_in - cash_out)
    other = sum((v for k, v in by_method.items() if k not in {"cash", "card", "bank_transfer"}), ZERO)
    return {
        "invoices": invoices, "movements": movements,
        "invoice_count": len(invoices),
        "gross_sales": money(sum((_dec(i.total) for i in invoices), ZERO)),
        "cash_sales": money(cash_sales), "card_sales": money(by_method.get("card", ZERO)),
        "bank_transfer_sales": money(by_method.get("bank_transfer", ZERO)), "other_sales": money(other),
        "change_given": money(sum((_dec(i.change_due) for i in invoices), ZERO)),
        "cash_in": money(cash_in), "cash_out": money(cash_out), "expected_cash": expected,
    }


def _serialize(db: Session, shift: Shift, viewer: User, *, detail: bool = False) -> dict:
    totals = _totals(db, shift)
    cashier = db.get(User, shift.cashier_id)
    # Blind close: while a shift is open the cashier must not see the expected cash before counting.
    reveal = shift.status == "closed" or _is_manager(viewer)
    data = {
        "id": shift.id, "shift_number": shift.shift_number, "status": shift.status,
        "cashier_id": shift.cashier_id, "cashier_name": cashier.display_name if cashier else "",
        "opened_at": shift.opened_at, "closed_at": shift.closed_at,
        "opening_float": shift.opening_float, "counted_cash": shift.counted_cash,
        "expected_cash": totals["expected_cash"] if reveal else None,
        "variance": shift.variance, "notes": shift.notes,
        "invoice_count": totals["invoice_count"],
        "totals_visible": reveal,
    }
    if reveal:
        for key in ("gross_sales", "cash_sales", "card_sales", "bank_transfer_sales", "other_sales",
                    "change_given", "cash_in", "cash_out"):
            data[key] = totals[key]
    if detail and reveal:
        data["invoices"] = [{
            "invoice_number": row.invoice_number, "created_at": row.created_at, "total": row.total,
            "change_due": row.change_due, "invoice_type": row.invoice_type,
        } for row in totals["invoices"]]
        data["movements"] = [{
            "movement_type": m.movement_type, "amount": m.amount, "reason": m.reason, "created_at": m.created_at,
        } for m in totals["movements"]]
    return data


def _open_shift(db: Session, user: User) -> Shift | None:
    return db.scalar(select(Shift).where(Shift.cashier_id == user.id, Shift.status == "open"))


@router.get("/current")
def current_shift(db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    shift = _open_shift(db, user)
    return {"shift": _serialize(db, shift, user) if shift else None}


@router.post("/open", status_code=201)
def open_shift(payload: OpenShiftInput, db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    company = _company(db)
    if _open_shift(db, user) is not None:
        raise HTTPException(status_code=409, detail="You already have an open shift; close it first")
    try:
        number = allocate_number(db, company.id, SHIFT_SERIES)
        shift = Shift(
            company_id=company.id, shift_number=number, cashier_id=user.id, status="open",
            opening_float=money(payload.opening_float), notes="",
        )
        db.add(shift)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="You already have an open shift; close it first") from exc
    db.refresh(shift)
    return _serialize(db, shift, user)


@router.post("/cash-movements", status_code=201)
def add_cash_movement(payload: CashMovementInput, db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    shift = _open_shift(db, user)
    if shift is None:
        raise HTTPException(status_code=409, detail="Open a shift before recording cash movements")
    amount = money(payload.amount)
    if payload.movement_type == "cash_out" and amount > _totals(db, shift)["expected_cash"]:
        raise HTTPException(status_code=422, detail="The withdrawal is larger than the cash that should be in the drawer")
    db.add(CashMovement(
        shift_id=shift.id, movement_type=payload.movement_type, amount=amount,
        reason=payload.reason.strip(), created_by=user.id,
    ))
    db.commit()
    return _serialize(db, shift, user)


@router.post("/current/close")
def close_shift(payload: CloseShiftInput, db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    shift = _open_shift(db, user)
    if shift is None:
        raise HTTPException(status_code=404, detail="You have no open shift")
    expected = _totals(db, shift)["expected_cash"]
    counted = money(payload.counted_cash)
    variance = money(counted - expected)
    if variance != ZERO and not payload.notes.strip():
        raise HTTPException(status_code=422, detail="Explain the cash difference in the notes before closing the shift")
    shift.status = "closed"
    shift.closed_at = utcnow()
    shift.counted_cash = counted
    shift.expected_cash = expected
    shift.variance = variance
    shift.notes = payload.notes.strip()
    db.commit()
    db.refresh(shift)
    return _serialize(db, shift, user, detail=True)


@router.get("")
def list_shifts(limit: int = 50, db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[dict]:
    company = _company(db)
    query = select(Shift).where(Shift.company_id == company.id)
    if not _is_manager(user):
        query = query.where(Shift.cashier_id == user.id)
    rows = db.scalars(query.order_by(Shift.opened_at.desc()).limit(min(max(limit, 1), 200))).all()
    return [_serialize(db, row, user) for row in rows]


@router.get("/{shift_id}")
def shift_report(shift_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    company = _company(db)
    shift = db.scalar(select(Shift).where(Shift.id == shift_id, Shift.company_id == company.id))
    if shift is None or (shift.cashier_id != user.id and not _is_manager(user)):
        raise HTTPException(status_code=404, detail="Shift not found")
    return _serialize(db, shift, user, detail=True)
