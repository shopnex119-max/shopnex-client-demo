from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AccountingAccount, JournalEntry, JournalLine
from app.financial import ZERO, money

DEFAULT_ACCOUNTS = (
    ("1000", "cash", "الصندوق", "Cash", "asset", "debit"),
    ("1010", "bank", "البنك / شبكة", "Bank / card clearing", "asset", "debit"),
    ("1100", "receivable", "العملاء المدينون", "Accounts receivable", "asset", "debit"),
    ("1200", "inventory", "المخزون", "Inventory", "asset", "debit"),
    ("2100", "payable", "الموردون الدائنون", "Accounts payable", "liability", "credit"),
    ("2200", "vat_output", "ضريبة مخرجات مستحقة", "VAT payable", "liability", "credit"),
    ("2210", "vat_input", "ضريبة مدخلات قابلة للاسترداد", "Input VAT", "asset", "debit"),
    ("3000", "equity", "رأس المال / حقوق الملكية", "Owner equity", "equity", "credit"),
    ("4000", "sales", "إيرادات المبيعات", "Sales revenue", "revenue", "credit"),
    ("5000", "cogs", "تكلفة البضاعة المباعة", "Cost of goods sold", "expense", "debit"),
    ("6100", "operating_expense", "مصروفات تشغيلية", "Operating expenses", "expense", "debit"),
)


def ensure_chart(db: Session, company_id: str) -> dict[str, AccountingAccount]:
    existing = {row.system_key: row for row in db.scalars(
        select(AccountingAccount).where(AccountingAccount.company_id == company_id)
    ).all()}
    for code, key, name_ar, name_en, account_type, normal_side in DEFAULT_ACCOUNTS:
        if key not in existing:
            account = AccountingAccount(
                company_id=company_id, code=code, system_key=key, name_ar=name_ar,
                name_en=name_en, account_type=account_type, normal_side=normal_side,
            )
            db.add(account)
            existing[key] = account
    db.flush()
    return existing


def post_journal(
    db: Session, *, company_id: str, user_id: str, source_type: str,
    source_id: str, description: str,
    lines: list[tuple[str, Decimal, Decimal, str]],
) -> JournalEntry:
    debit_total = money(sum((money(debit) for _, debit, _, _ in lines), ZERO))
    credit_total = money(sum((money(credit) for _, _, credit, _ in lines), ZERO))
    if debit_total <= ZERO or debit_total != credit_total:
        raise HTTPException(status_code=422, detail="Journal is not balanced; transaction was not posted")
    chart = ensure_chart(db, company_id)
    entry_id = str(uuid4())
    entry_number = f"JE-{datetime.now(timezone.utc):%Y%m%d}-{entry_id[:8].upper()}"
    entry = JournalEntry(
        id=entry_id, company_id=company_id, entry_number=entry_number,
        source_type=source_type, source_id=source_id, description=description,
        status="posted", created_by=user_id,
    )
    db.add(entry)
    db.flush()
    for key, debit, credit, memo in lines:
        debit, credit = money(debit), money(credit)
        if debit == ZERO and credit == ZERO:
            continue
        if debit < ZERO or credit < ZERO or (debit > ZERO and credit > ZERO):
            raise HTTPException(status_code=422, detail="Journal line must have one non-negative debit or credit")
        if key not in chart:
            raise HTTPException(status_code=422, detail="Unknown accounting system account")
        db.add(JournalLine(
            entry_id=entry.id, account_id=chart[key].id, memo=memo[:240], debit=debit, credit=credit,
        ))
    return entry
