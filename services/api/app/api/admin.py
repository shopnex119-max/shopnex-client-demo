from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, select, update
from sqlalchemy.orm import Session

from app.api.zatca import DEFAULT_COMPANY_ID
from app.core.auth import require_user
from app.core.permissions import is_admin_role
from app.core.security import verify_password
from app.db.models import (
    AccountingAccount,
    CashMovement,
    Company,
    InventoryMovement,
    Invoice,
    InvoiceLine,
    InvoicePayment,
    JournalEntry,
    JournalLine,
    ModuleRecord,
    Product,
    Purchase,
    PurchaseLine,
    PurchasePayment,
    Shift,
    Supplier,
    TaxRule,
    User,
    ZatcaDocument,
    ZatcaSettings,
)
from app.db.session import get_db

router = APIRouter(prefix="/admin", tags=["Administration"])


class OperationalResetInput(BaseModel):
    current_password: str = Field(min_length=12, max_length=256)


def _zero_counts() -> dict[str, int]:
    return {
        "invoices": 0,
        "invoice_lines": 0,
        "invoice_payments": 0,
        "purchases": 0,
        "purchase_lines": 0,
        "purchase_payments": 0,
        "inventory_movements": 0,
        "journal_entries": 0,
        "journal_lines": 0,
        "products": 0,
        "suppliers": 0,
        "customers": 0,
        "cash_movements": 0,
        "shifts": 0,
    }


def _delete_count(db: Session, counts: dict[str, int], key: str, model, condition) -> None:
    result = db.execute(delete(model).where(condition))
    counts[key] = max(int(result.rowcount or 0), 0)


@router.post("/reset-operational-data")
def reset_operational_data(
    payload: OperationalResetInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> dict:
    """Clear local operational records while retaining identity, setup and ZATCA state."""
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="An administrator account is required")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid account password")

    company = db.get(Company, DEFAULT_COMPANY_ID)
    counts = _zero_counts()
    if company is None:
        return {"message": "Operational data is already empty", "deleted_counts": counts}

    company_id = company.id
    invoice_ids = select(Invoice.id).where(Invoice.company_id == company_id)
    purchase_ids = select(Purchase.id).where(Purchase.company_id == company_id)
    journal_ids = select(JournalEntry.id).where(JournalEntry.company_id == company_id)

    try:
        # Preserve ZATCA audit documents/configuration, but detach references to invoices being cleared.
        db.execute(
            update(ZatcaDocument)
            .where(ZatcaDocument.company_id == company_id, ZatcaDocument.invoice_id.in_(invoice_ids))
            .values(invoice_id=None)
        )

        # Remove dependent rows first so the reset works with SQLite and PostgreSQL FK enforcement.
        _delete_count(db, counts, "inventory_movements", InventoryMovement, InventoryMovement.company_id == company_id)
        _delete_count(db, counts, "invoice_payments", InvoicePayment, InvoicePayment.invoice_id.in_(invoice_ids))
        _delete_count(db, counts, "invoice_lines", InvoiceLine, InvoiceLine.invoice_id.in_(invoice_ids))
        _delete_count(db, counts, "purchase_payments", PurchasePayment, PurchasePayment.purchase_id.in_(purchase_ids))
        _delete_count(db, counts, "purchase_lines", PurchaseLine, PurchaseLine.purchase_id.in_(purchase_ids))
        _delete_count(db, counts, "journal_lines", JournalLine, JournalLine.entry_id.in_(journal_ids))
        shift_ids = select(Shift.id).where(Shift.company_id == company_id)
        _delete_count(db, counts, "cash_movements", CashMovement, CashMovement.shift_id.in_(shift_ids))
        _delete_count(db, counts, "invoices", Invoice, Invoice.company_id == company_id)
        _delete_count(db, counts, "shifts", Shift, Shift.company_id == company_id)
        _delete_count(db, counts, "purchases", Purchase, Purchase.company_id == company_id)
        _delete_count(db, counts, "journal_entries", JournalEntry, JournalEntry.company_id == company_id)
        _delete_count(db, counts, "products", Product, Product.company_id == company_id)
        _delete_count(db, counts, "suppliers", Supplier, Supplier.company_id == company_id)
        _delete_count(db, counts, "customers", ModuleRecord, and_(ModuleRecord.company_id == company_id, ModuleRecord.module == "crm"))
        db.commit()
    except Exception:
        db.rollback()
        raise

    preserved_counts = {
        "users": int(db.scalar(select(User.id).limit(1)) is not None),
        "accounting_accounts": int(db.scalar(select(AccountingAccount.id).where(AccountingAccount.company_id == company_id).limit(1)) is not None),
        "tax_rules": int(db.scalar(select(TaxRule.id).where(TaxRule.company_id == company_id).limit(1)) is not None),
        "zatca_settings": int(db.scalar(select(ZatcaSettings.id).where(ZatcaSettings.company_id == company_id).limit(1)) is not None),
    }
    return {
        "message": "Operational data reset completed",
        "deleted_counts": counts,
        "preserved_records_present": preserved_counts,
    }
