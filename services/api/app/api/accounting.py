from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from io import StringIO
import csv
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounting import ensure_chart
from app.api.zatca import _company
from app.core.auth import require_user
from app.db.models import (
    AccountingAccount, Invoice, InvoiceLine, InvoicePayment, JournalEntry, JournalLine,
    Product, Purchase, PurchaseLine, PurchasePayment, Supplier, TaxRule, User,
)
from app.db.session import get_db
from app.financial import ZERO, money
from app.schemas import TaxRuleInput
from app.tax import create_tax_rule_version, ensure_default_tax_rules

router = APIRouter(tags=["Accounting, tax & reports"], dependencies=[Depends(require_user)])
SAUDI_TZ = ZoneInfo("Asia/Riyadh")


def _local_day(value: datetime | date) -> date:
    if isinstance(value, datetime):
        utc_value = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return utc_value.astimezone(SAUDI_TZ).date()
    return value


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _csv_cell(value):
    if isinstance(value, str) and value.lstrip("\ufeff \t\r\n").startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def _validate_period(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must not be after end_date")


def _in_period(created_at: datetime, start_date: date | None, end_date: date | None) -> bool:
    day = _local_day(created_at)
    return (start_date is None or day >= start_date) and (end_date is None or day <= end_date)


def _balances(db: Session, company_id: str) -> tuple[list[dict], dict[str, dict]]:
    accounts = ensure_chart(db, company_id)
    db.commit()
    totals = {key: {"debit": ZERO, "credit": ZERO} for key in accounts}
    rows = db.execute(
        select(AccountingAccount.system_key, JournalLine.debit, JournalLine.credit)
        .join(JournalLine, JournalLine.account_id == AccountingAccount.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(AccountingAccount.company_id == company_id, JournalEntry.company_id == company_id, JournalEntry.status == "posted")
    ).all()
    for key, debit, credit in rows:
        totals[key]["debit"] += _decimal(debit)
        totals[key]["credit"] += _decimal(credit)
    output = []
    for key, account in accounts.items():
        debit = money(totals[key]["debit"])
        credit = money(totals[key]["credit"])
        balance = money(debit - credit if account.normal_side == "debit" else credit - debit)
        output.append({
            "id": account.id, "code": account.code, "system_key": key,
            "name_ar": account.name_ar, "name_en": account.name_en,
            "account_type": account.account_type, "normal_side": account.normal_side,
            "debit_total": debit, "credit_total": credit, "balance": balance,
        })
    output.sort(key=lambda row: row["code"])
    return output, totals


def _summarize(db: Session, company_id: str, start_date: date | None, end_date: date | None) -> dict:
    _validate_period(start_date, end_date)
    invoices_all = db.scalars(select(Invoice).where(Invoice.company_id == company_id)).all()
    purchases_all = db.scalars(select(Purchase).where(Purchase.company_id == company_id)).all()
    invoices = [item for item in invoices_all if _in_period(item.created_at, start_date, end_date)]
    purchases = [item for item in purchases_all if _in_period(item.created_at, start_date, end_date)]
    invoice_ids = [item.id for item in invoices]
    purchase_ids = [item.id for item in purchases]
    invoice_lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids))).all() if invoice_ids else []
    purchase_lines = db.scalars(select(PurchaseLine).where(PurchaseLine.purchase_id.in_(purchase_ids))).all() if purchase_ids else []

    sales_total = money(sum((_decimal(row.total) for row in invoices), ZERO))
    sales_net = money(sum((_decimal(row.taxable_subtotal) for row in invoices), ZERO))
    sales_vat = money(sum((_decimal(row.vat_total) for row in invoices), ZERO))
    sales_paid = money(sum((_decimal(row.amount_paid) for row in invoices), ZERO))
    receivable = money(sum((max(ZERO, _decimal(row.total) - _decimal(row.amount_paid)) for row in invoices_all), ZERO))
    purchase_total = money(sum((_decimal(row.total) for row in purchases), ZERO))
    purchase_net = money(sum((_decimal(row.taxable_subtotal) for row in purchases), ZERO))
    purchase_vat = money(sum((_decimal(row.vat_total) for row in purchases), ZERO))
    purchase_paid = money(sum((_decimal(row.amount_paid) for row in purchases), ZERO))
    payable = money(sum((max(ZERO, _decimal(row.total) - _decimal(row.amount_paid)) for row in purchases_all), ZERO))

    cogs = money(sum((money(_decimal(line.unit_cost) * _decimal(line.quantity)) for line in invoice_lines), ZERO))
    gross_profit = money(sales_net - cogs)
    vat_net = money(sales_vat - purchase_vat)
    inventory_products = db.scalars(select(Product).where(Product.company_id == company_id, Product.active.is_(True))).all()
    inventory_value = money(sum((money(_decimal(product.quantity) * _decimal(product.average_cost)) for product in inventory_products), ZERO))
    products_without_cost = sum(1 for p in inventory_products if _decimal(p.quantity) > ZERO and _decimal(p.average_cost) == ZERO)

    payment_totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    invoice_payments = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id.in_(invoice_ids))).all() if invoice_ids else []
    purchase_payments = db.scalars(select(PurchasePayment).where(PurchasePayment.purchase_id.in_(purchase_ids))).all() if purchase_ids else []
    for payment in [*invoice_payments, *purchase_payments]:
        payment_totals[payment.method] += _decimal(payment.amount)

    product_stats: dict[str, dict] = {}
    for line in invoice_lines:
        key = line.sku
        item = product_stats.setdefault(key, {"sku": key, "name": line.description, "quantity": ZERO, "net_sales": ZERO, "vat": ZERO, "cost": ZERO})
        item["quantity"] += _decimal(line.quantity)
        item["net_sales"] += _decimal(line.taxable_amount)
        item["vat"] += _decimal(line.vat_amount)
        item["cost"] += money(_decimal(line.unit_cost) * _decimal(line.quantity))
    top_products = sorted(({
        **item, "quantity": str(item["quantity"]), "net_sales": money(item["net_sales"]),
        "vat": money(item["vat"]), "cost": money(item["cost"]),
        "gross_profit": money(item["net_sales"] - item["cost"]),
    } for item in product_stats.values()), key=lambda item: Decimal(item["net_sales"]), reverse=True)[:10]

    supplier_stats: dict[str, dict] = {}
    for purchase in purchases:
        item = supplier_stats.setdefault(purchase.supplier_name, {"supplier": purchase.supplier_name, "count": 0, "purchases": ZERO, "paid": ZERO, "balance": ZERO})
        item["count"] += 1
        item["purchases"] += _decimal(purchase.total)
        item["paid"] += _decimal(purchase.amount_paid)
        item["balance"] += _decimal(purchase.total) - _decimal(purchase.amount_paid)
    top_suppliers = sorted(({
        **item, "purchases": money(item["purchases"]), "paid": money(item["paid"]), "balance": money(item["balance"]),
    } for item in supplier_stats.values()), key=lambda item: item["purchases"], reverse=True)[:10]

    day_sales: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for row in invoices:
        day_sales[_local_day(row.created_at).isoformat()] += _decimal(row.total)
    sales_trend = [{"date": key, "sales": money(value)} for key, value in sorted(day_sales.items())]
    return {
        "period": {"start_date": start_date, "end_date": end_date, "timezone": "Asia/Riyadh"},
        "currency": "SAR",
        "sales": {"count": len(invoices), "total": sales_total, "net": sales_net, "vat": sales_vat, "paid": sales_paid, "receivables": receivable},
        "purchases": {"count": len(purchases), "total": purchase_total, "net": purchase_net, "vat": purchase_vat, "paid": purchase_paid, "payables": payable},
        "tax": {"output_vat": sales_vat, "input_vat": purchase_vat, "net_vat_due_estimate": vat_net, "filing_status": "report_only_not_filed"},
        "profitability": {"net_sales_before_vat": sales_net, "cost_of_goods_sold": cogs, "gross_profit_estimate": gross_profit, "inventory_value_at_average_cost": inventory_value, "items_with_missing_cost": products_without_cost},
        "payments_by_method": [{"method": key, "amount": money(value)} for key, value in sorted(payment_totals.items())],
        "sales_trend": sales_trend,
        "top_products": top_products,
        "supplier_performance": top_suppliers,
        "data_scope": "posted_local_records",
    }


@router.get("/reports/cashier-handover")
def cashier_handover(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(require_user),
):
    """Return cashier-attributed sales and tender totals for a local-date range."""
    _validate_period(start_date, end_date)
    company = _company(db)
    invoices = db.scalars(select(Invoice).where(Invoice.company_id == company.id).order_by(Invoice.created_at)).all()
    invoices = [row for row in invoices if _in_period(row.created_at, start_date, end_date)]
    invoice_ids = [row.id for row in invoices]
    payments = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id.in_(invoice_ids))).all() if invoice_ids else []
    payment_by_invoice: dict[str, list[InvoicePayment]] = defaultdict(list)
    for payment in payments:
        payment_by_invoice[payment.invoice_id].append(payment)
    user_ids = {row.created_by for row in invoices if row.created_by}
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
    names = {row.id: row.display_name for row in users}
    groups: dict[str, dict] = {}
    for invoice in invoices:
        key = invoice.created_by or "unassigned"
        item = groups.setdefault(key, {
            "cashier_id": invoice.created_by, "cashier_name": names.get(invoice.created_by, "غير محدد"),
            "invoice_count": 0, "gross_sales": ZERO, "cash": ZERO, "card": ZERO,
            "bank_transfer": ZERO, "other": ZERO, "cash_change": ZERO,
            "items_sold": ZERO, "invoices": [],
        })
        invoice_payments = payment_by_invoice.get(invoice.id, [])
        tender: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for payment in invoice_payments:
            tender[payment.method] += _decimal(payment.amount)
        item["invoice_count"] += 1
        item["gross_sales"] += _decimal(invoice.total)
        item["cash"] += tender["cash"]
        item["card"] += tender["card"]
        item["bank_transfer"] += tender["bank_transfer"]
        item["other"] += sum((amount for method, amount in tender.items() if method not in {"cash", "card", "bank_transfer"}), ZERO)
        item["cash_change"] += _decimal(invoice.change_due)
        item["invoices"].append({
            "invoice_number": invoice.invoice_number, "created_at": invoice.created_at,
            "total": invoice.total, "cash": money(tender["cash"]), "card": money(tender["card"]),
            "bank_transfer": money(tender["bank_transfer"]),
            "other": money(sum((amount for method, amount in tender.items() if method not in {"cash", "card", "bank_transfer"}), ZERO)),
            "change_due": invoice.change_due,
        })
    line_rows = db.execute(select(Invoice.id, InvoiceLine.quantity).join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id).where(Invoice.id.in_(invoice_ids))).all() if invoice_ids else []
    owner_by_invoice = {row.id: row.created_by or "unassigned" for row in invoices}
    for invoice_id, quantity in line_rows:
        groups[owner_by_invoice[invoice_id]]["items_sold"] += _decimal(quantity)
    rows = []
    for item in groups.values():
        # InvoicePayment stores the applied cash amount after cash change has already been deducted.
        item["cash_expected"] = money(item["cash"])
        for key in ("gross_sales", "cash", "card", "bank_transfer", "other", "cash_change", "items_sold"):
            item[key] = money(item[key]) if key != "items_sold" else str(item[key])
        rows.append(item)
    rows.sort(key=lambda row: row["cashier_name"].casefold())
    return {"period": {"start_date": start_date, "end_date": end_date, "timezone": "Asia/Riyadh"}, "cashiers": rows, "currency": "SAR", "data_scope": "posted_local_records"}

@router.get("/accounting/accounts")
def list_accounts(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    accounts = ensure_chart(db, company.id)
    db.commit()
    return [{
        "id": account.id, "code": account.code, "system_key": key,
        "name_ar": account.name_ar, "name_en": account.name_en,
        "account_type": account.account_type, "normal_side": account.normal_side,
        "active": account.active,
    } for key, account in sorted(accounts.items(), key=lambda item: item[1].code)]


@router.get("/accounting/trial-balance")
def trial_balance(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    rows, totals = _balances(db, company.id)
    debit = money(sum((row["debit_total"] for row in rows), ZERO))
    credit = money(sum((row["credit_total"] for row in rows), ZERO))
    return {"accounts": rows, "debit_total": debit, "credit_total": credit, "balanced": debit == credit, "currency": "SAR"}


@router.get("/accounting/journals")
def list_journals(db: Session = Depends(get_db), limit: int = 100, _user: User = Depends(require_user)):
    company = _company(db)
    bounded_limit = min(max(limit, 1), 500)
    entries = db.scalars(select(JournalEntry).where(JournalEntry.company_id == company.id).order_by(JournalEntry.created_at.desc()).limit(bounded_limit)).all()
    result = []
    for entry in entries:
        lines = db.execute(select(JournalLine, AccountingAccount).join(
            AccountingAccount, AccountingAccount.id == JournalLine.account_id,
        ).where(JournalLine.entry_id == entry.id).order_by(AccountingAccount.code)).all()
        result.append({
            "id": entry.id, "entry_number": entry.entry_number, "source_type": entry.source_type,
            "source_id": entry.source_id, "description": entry.description, "status": entry.status,
            "created_at": entry.created_at,
            "lines": [{"account_code": account.code, "account_ar": account.name_ar,
                       "account_en": account.name_en, "memo": line.memo,
                       "debit": line.debit, "credit": line.credit} for line, account in lines],
        })
    return result


@router.get("/accounting/ledger/{system_key}")
def account_ledger(system_key: str, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    account = db.scalar(select(AccountingAccount).where(
        AccountingAccount.company_id == company.id, AccountingAccount.system_key == system_key,
    ))
    if account is None:
        raise HTTPException(status_code=404, detail="Accounting account not found")
    rows = db.execute(select(JournalEntry, JournalLine).join(
        JournalLine, JournalLine.entry_id == JournalEntry.id,
    ).where(JournalEntry.company_id == company.id, JournalEntry.status == "posted",
            JournalLine.account_id == account.id).order_by(JournalEntry.created_at)).all()
    balance = ZERO
    result = []
    for entry, line in rows:
        balance += _decimal(line.debit) - _decimal(line.credit) if account.normal_side == "debit" else _decimal(line.credit) - _decimal(line.debit)
        result.append({"entry_number": entry.entry_number, "description": entry.description,
                       "created_at": entry.created_at, "debit": line.debit, "credit": line.credit,
                       "running_balance": money(balance)})
    return {"account": {"code": account.code, "name_ar": account.name_ar, "name_en": account.name_en}, "entries": result}


@router.get("/accounting/receivables")
def receivables(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    rows = db.scalars(select(Invoice).where(Invoice.company_id == company.id, Invoice.total > Invoice.amount_paid).order_by(Invoice.created_at)).all()
    today = datetime.now(SAUDI_TZ).date()
    result = []
    for row in rows:
        balance = money(_decimal(row.total) - _decimal(row.amount_paid))
        invoice_day = _local_day(row.created_at)
        age = max(0, (today - invoice_day).days)
        result.append({"invoice_number": row.invoice_number, "customer": row.customer_name,
                       "invoice_date": invoice_day, "days_open": age,
                       "age_bucket": "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+",
                       "total": row.total, "paid": row.amount_paid, "balance_due": balance})
    return result


@router.get("/accounting/payables")
def payables(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    rows = db.scalars(select(Purchase).where(Purchase.company_id == company.id, Purchase.total > Purchase.amount_paid).order_by(Purchase.due_date, Purchase.created_at)).all()
    today = datetime.now(SAUDI_TZ).date()
    result = []
    for row in rows:
        due = row.due_date or _local_day(row.created_at)
        age = max(0, (today - due).days)
        result.append({"purchase_number": row.purchase_number, "supplier": row.supplier_name,
                       "due_date": due, "days_overdue": age,
                       "age_bucket": "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+",
                       "total": row.total, "paid": row.amount_paid,
                       "balance_due": money(_decimal(row.total) - _decimal(row.amount_paid))})
    return result


@router.get("/tax/rules")
def list_tax_rules(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    ensure_default_tax_rules(db, company.id)
    db.commit()
    rows = db.scalars(select(TaxRule).where(TaxRule.company_id == company.id).order_by(TaxRule.code, TaxRule.version)).all()
    return [{"id": row.id, "code": row.code, "version": row.version,
             "name_ar": row.name_ar, "name_en": row.name_en, "category": row.category,
             "rate": row.rate, "effective_from": row.effective_from, "effective_to": row.effective_to,
             "reason_required": row.reason_required, "code_scope": "internal_shopnex_code_not_zatca_code"} for row in rows]


@router.post("/tax/rules", status_code=201)
def add_tax_rule_version(payload: TaxRuleInput, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    try:
        ensure_default_tax_rules(db, company.id)
        row = create_tax_rule_version(db, company.id, payload)
        db.commit()
        db.refresh(row)
    except HTTPException:
        db.rollback()
        raise
    return {"id": row.id, "code": row.code, "version": row.version,
            "name_ar": row.name_ar, "name_en": row.name_en, "category": row.category,
            "rate": row.rate, "effective_from": row.effective_from,
            "effective_to": row.effective_to, "reason_required": row.reason_required,
            "code_scope": "internal_shopnex_code_not_zatca_code"}


@router.get("/reports/overview")
def reports_overview(
    start_date: date | None = None, end_date: date | None = None,
    db: Session = Depends(get_db), _user: User = Depends(require_user),
):
    company = _company(db)
    _validate_period(start_date, end_date)
    return _summarize(db, company.id, start_date, end_date)


@router.get("/reports/overview.csv")
def reports_overview_csv(
    start_date: date | None = None, end_date: date | None = None,
    db: Session = Depends(get_db), _user: User = Depends(require_user),
) -> Response:
    """UTF-8 BOM CSV export for finance/spreadsheet tools; this endpoint does not submit a tax return."""
    company = _company(db)
    report = _summarize(db, company.id, start_date, end_date)
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["section", "metric", "value", "currency"])
    for section in ("sales", "purchases", "tax", "profitability"):
        for key, value in report[section].items():
            writer.writerow([_csv_cell(section), _csv_cell(key), _csv_cell(value), "SAR" if isinstance(value, (Decimal, int)) else ""])
    for row in report["top_products"]:
        writer.writerow(["top_product", _csv_cell(row["sku"]), _csv_cell(row["name"]), row["quantity"], row["net_sales"], row["vat"], row["cost"], row["gross_profit"], "SAR"])
    for row in report["supplier_performance"]:
        writer.writerow(["supplier", _csv_cell(row["supplier"]), row["count"], row["purchases"], row["paid"], row["balance"], "SAR"])
    for row in report["sales_trend"]:
        writer.writerow(["sales_trend", row["date"], row["sales"], "SAR"])
    for row in report["payments_by_method"]:
        writer.writerow(["payment_method", row["method"], row["amount"], "SAR"])
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=shopnex-finance-report.csv"},
    )
