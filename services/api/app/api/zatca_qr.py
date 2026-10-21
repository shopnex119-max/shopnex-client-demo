from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.zatca import _company
from app.core.auth import require_user
from app.db.models import Invoice, User, ZatcaSettings
from app.db.session import get_db
from app.zatca_qr import build_phase1_tlv_qr

router = APIRouter(prefix="/zatca", tags=["ZATCA QR preview"], dependencies=[Depends(require_user)])


@router.get("/invoices/{invoice_id}/qr/phase1")
def invoice_phase1_qr(invoice_id: str, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    """Local five-tag Phase 1-format preview only; this is not a Phase 2/production compliance adapter."""
    company = _company(db)
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.company_id == company.id))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    settings = db.scalar(select(ZatcaSettings).where(
        ZatcaSettings.company_id == company.id, ZatcaSettings.environment == "sandbox",
    ))
    seller_name = (settings.company_name if settings and settings.company_name else company.name).strip()
    vat_number = (settings.vat_number if settings and settings.vat_number else company.vat_number or "").strip()
    if not seller_name or not vat_number:
        raise HTTPException(status_code=422, detail="Configure the seller legal name and VAT registration number before generating the local QR preview")
    issued = invoice.created_at
    if issued.tzinfo is None:
        issued = issued.replace(tzinfo=timezone.utc)
    issued_at = issued.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    encoded, tags = build_phase1_tlv_qr(
        seller_name=seller_name, vat_number=vat_number, issued_at=issued_at,
        total_including_vat=invoice.total, vat_total=invoice.vat_total,
    )
    return {
        "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
        "seller_name": seller_name, "vat_number": vat_number,
        "format": "TLV_Base64_5_tag_local_preview", "qr_base64": encoded,
        "tags": tags, "phase2_ready": False, "authority_contacted": False,
        "disclaimer": "Local Phase 1-format preview only. Not a ZATCA Phase 2 signed/cleared invoice, not submitted, and not a statement of compliance.",
    }
