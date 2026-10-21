from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import TaxRule

DEFAULT_RULES = (
    ("SHOPNEX-STD-15", "ضريبة قياسية", "Standard VAT", "standard", Decimal("15.00"), False),
    ("SHOPNEX-ZERO", "نسبة صفرية", "Zero-rated", "zero_rated", Decimal("0.00"), False),
    ("SHOPNEX-EXEMPT", "معفى", "Exempt", "exempt", Decimal("0.00"), True),
    ("SHOPNEX-OOS", "خارج النطاق", "Out of scope", "out_of_scope", Decimal("0.00"), True),
)


def ensure_default_tax_rules(db: Session, company_id: str) -> None:
    existing_codes = set(db.scalars(select(TaxRule.code).where(TaxRule.company_id == company_id)).all())
    for code, name_ar, name_en, category, rate, reason_required in DEFAULT_RULES:
        if code not in existing_codes:
            db.add(TaxRule(
                company_id=company_id, code=code, version=1, name_ar=name_ar, name_en=name_en,
                category=category, rate=rate, effective_from=date(2020, 7, 1),
                reason_required=reason_required,
            ))
    db.flush()


def resolve_tax_rule(
    db: Session, company_id: str, category: str, rate: Decimal,
    on_date: date | None = None, reason: str = "",
) -> TaxRule:
    ensure_default_tax_rules(db, company_id)
    day = on_date or date.today()
    rule = db.scalar(
        select(TaxRule).where(
            TaxRule.company_id == company_id,
            TaxRule.category == category,
            TaxRule.rate == rate,
            TaxRule.effective_from <= day,
            (TaxRule.effective_to.is_(None) | (TaxRule.effective_to >= day)),
        ).order_by(TaxRule.effective_from.desc(), TaxRule.version.desc()).limit(1)
    )
    if rule is None:
        raise HTTPException(status_code=422, detail="No effective tax rule matches the selected category and rate")
    if rule.reason_required and not reason.strip():
        raise HTTPException(status_code=422, detail=f"Tax reason is required for rule {rule.code}")
    return rule


def create_tax_rule_version(db: Session, company_id: str, payload) -> TaxRule:
    latest = db.scalar(
        select(TaxRule).where(TaxRule.company_id == company_id, TaxRule.code == payload.code)
        .order_by(TaxRule.version.desc()).limit(1)
    )
    version = 1 if latest is None else latest.version + 1
    if latest is not None:
        if payload.effective_from <= latest.effective_from:
            raise HTTPException(status_code=409, detail="A new tax-rule version must have a later effective date")
        if latest.effective_to is None or latest.effective_to >= payload.effective_from:
            latest.effective_to = payload.effective_from - timedelta(days=1)
    existing_rules = db.scalars(select(TaxRule).where(
        TaxRule.company_id == company_id, TaxRule.category == payload.category,
        TaxRule.rate == payload.rate,
    )).all()
    new_end = payload.effective_to or date.max
    for existing in existing_rules:
        old_end = existing.effective_to or date.max
        if existing.effective_from <= new_end and payload.effective_from <= old_end:
            raise HTTPException(status_code=409, detail="Tax rule overlaps another active rule for the same category and rate")
    row = TaxRule(
        company_id=company_id, code=payload.code.strip(), version=version,
        name_ar=payload.name_ar.strip(), name_en=payload.name_en.strip(),
        category=payload.category, rate=payload.rate, effective_from=payload.effective_from,
        effective_to=payload.effective_to, reason_required=payload.reason_required,
    )
    db.add(row)
    db.flush()
    return row
