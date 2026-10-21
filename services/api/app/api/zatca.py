from datetime import timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import require_user
from app.db.models import Company, User, ZatcaSettings
from app.db.session import get_db
from app.integrations.secrets import SecretStoreUnavailable, credential_exists, store_credential
from app.schemas import ZatcaConfigInput, ZatcaConfigOutput

router = APIRouter(prefix="/zatca", tags=["ZATCA / FATOORA"], dependencies=[Depends(require_user)])
DEFAULT_COMPANY_ID = "local-default-company"


def _company(db: Session) -> Company:
    company = db.get(Company, DEFAULT_COMPANY_ID)
    if company is None:
        company = Company(id=DEFAULT_COMPANY_ID, name="منشأة المستخدم", currency="SAR")
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


def _response(record: ZatcaSettings | None, environment: str, company_id: str) -> ZatcaConfigOutput:
    if record is None:
        return ZatcaConfigOutput(configured=False, environment=environment, company_name="", vat_number="", egs_unit="", adapter_ready=False)
    cert_path = record.certificate_path or ""
    key_path = record.private_key_path or ""
    return ZatcaConfigOutput(
        configured=bool(record.company_name and record.vat_number and record.egs_unit),
        environment=record.environment,
        company_name=record.company_name,
        vat_number=record.vat_number,
        egs_unit=record.egs_unit,
        certificate_path=cert_path,
        private_key_path=key_path,
        secret_present=credential_exists(company_id, environment),
        certificate_present=bool(cert_path and Path(cert_path).is_file()),
        private_key_present=bool(key_path and Path(key_path).is_file()),
        adapter_ready=False,
        last_validation=record.last_validation.astimezone(timezone.utc).isoformat() if record.last_validation else None,
    )


@router.get("/config", response_model=ZatcaConfigOutput)
def get_config(environment: str = "sandbox", db: Session = Depends(get_db)) -> ZatcaConfigOutput:
    if environment not in {"sandbox", "production"}:
        raise HTTPException(status_code=422, detail="Environment must be sandbox or production")
    company = _company(db)
    record = db.scalar(select(ZatcaSettings).where(ZatcaSettings.company_id == company.id, ZatcaSettings.environment == environment))
    return _response(record, environment, company.id)


@router.put("/config", response_model=ZatcaConfigOutput)
def save_config(payload: ZatcaConfigInput, db: Session = Depends(get_db)) -> ZatcaConfigOutput:
    company = _company(db)
    if payload.api_credential:
        try:
            store_credential(company.id, payload.environment, payload.api_credential)
        except SecretStoreUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    record = db.scalar(select(ZatcaSettings).where(ZatcaSettings.company_id == company.id, ZatcaSettings.environment == payload.environment))
    if record is None:
        record = ZatcaSettings(company_id=company.id, environment=payload.environment)
        db.add(record)
    record.company_name = payload.company_name.strip()
    record.vat_number = payload.vat_number.strip()
    record.egs_unit = payload.egs_unit.strip()
    record.certificate_path = payload.certificate_path.strip()
    record.private_key_path = payload.private_key_path.strip()
    db.commit()
    db.refresh(record)
    return _response(record, payload.environment, company.id)


@router.post("/validate")
def validate_local_fields(environment: str = "sandbox", db: Session = Depends(get_db)) -> dict:
    """Checks saved local fields only; this endpoint never contacts the authority."""
    company = _company(db)
    record = db.scalar(select(ZatcaSettings).where(ZatcaSettings.company_id == company.id, ZatcaSettings.environment == environment))
    if record is None:
        return {"valid": False, "scope": "local_only", "missing": ["company_name", "vat_number", "egs_unit"], "authority_contacted": False}
    missing = [name for name in ("company_name", "vat_number", "egs_unit") if not getattr(record, name)]
    record.last_validation = __import__("datetime").datetime.now(timezone.utc)
    db.commit()
    return {"valid": not missing, "scope": "local_only", "missing": missing, "authority_contacted": False, "adapter_ready": False}


@router.post("/test-connection")
def test_connection() -> dict:
    raise HTTPException(status_code=501, detail="The official ZATCA adapter is not enabled. No authority request was sent.")
