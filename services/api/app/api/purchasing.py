from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounting import post_journal
from app.api.zatca import _company
from app.core.auth import require_user
from app.db.models import (
    InventoryMovement, Product, Purchase, PurchaseLine, PurchasePayment, Supplier, User,
)
from app.db.session import get_db
from app.financial import ZERO, calculate_line, money
from app.schemas import PurchaseInput, PurchasePaymentAddInput, SupplierInput, SupplierOutput
from app.tax import resolve_tax_rule

router = APIRouter(tags=["Purchasing & suppliers"], dependencies=[Depends(require_user)])
SAUDI_TZ = ZoneInfo("Asia/Riyadh")
PAYMENT_METHODS_TO_ACCOUNT = {"cash": "cash", "card": "bank", "bank_transfer": "bank", "wallet": "bank", "other": "bank"}


def _supplier_or_404(db: Session, company_id: str, supplier_id: str) -> Supplier:
    supplier = db.scalar(select(Supplier).where(
        Supplier.id == supplier_id, Supplier.company_id == company_id, Supplier.active.is_(True),
    ))
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found or inactive")
    return supplier


def _purchase_or_404(db: Session, company_id: str, purchase_id: str, *, lock: bool = False) -> Purchase:
    query = select(Purchase).where(Purchase.id == purchase_id, Purchase.company_id == company_id)
    if lock:
        query = query.with_for_update()
    purchase = db.scalar(query)
    if purchase is None:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


def _purchase_json(db: Session, row: Purchase) -> dict:
    lines = db.scalars(select(PurchaseLine).where(PurchaseLine.purchase_id == row.id)).all()
    payments = db.scalars(select(PurchasePayment).where(PurchasePayment.purchase_id == row.id).order_by(PurchasePayment.created_at)).all()
    return {
        "id": row.id, "purchase_number": row.purchase_number,
        "supplier_invoice_number": row.supplier_invoice_number,
        "supplier_id": row.supplier_id, "supplier_name": row.supplier_name,
        "status": row.status, "subtotal": row.subtotal, "discount_total": row.discount_total,
        "taxable_subtotal": row.taxable_subtotal, "vat_total": row.vat_total, "total": row.total,
        "amount_paid": row.amount_paid, "balance_due": money(row.total - row.amount_paid),
        "due_date": row.due_date, "created_at": row.created_at, "currency": "SAR",
        "lines": [{
            "product_id": line.product_id, "sku": line.sku, "description": line.description,
            "quantity": line.quantity, "unit_cost": line.unit_cost,
            "discount_percent": line.discount_percent, "discount_amount": line.discount_amount,
            "taxable_amount": line.taxable_amount, "tax_category": line.tax_category,
            "tax_reason": line.tax_reason, "tax_rule_code": line.tax_rule_code,
            "tax_rule_version": line.tax_rule_version, "vat_rate": line.vat_rate,
            "vat_amount": line.vat_amount, "total_amount": line.total_amount,
            "price_includes_vat": line.price_includes_vat,
        } for line in lines],
        "payments": [{"id": p.id, "method": p.method, "amount": p.amount, "created_at": p.created_at} for p in payments],
    }


def _post_payment_journal(db: Session, *, purchase: Purchase, payment: PurchasePayment, user: User) -> None:
    amount = money(payment.amount)
    post_journal(
        db, company_id=purchase.company_id, user_id=user.id,
        source_type="purchase_payment", source_id=payment.id,
        description=f"تسديد المورد {purchase.supplier_name} · {purchase.purchase_number}",
        lines=[
            ("payable", amount, ZERO, "تخفيض رصيد المورد"),
            (PAYMENT_METHODS_TO_ACCOUNT[payment.method], ZERO, amount, f"دفعة {payment.method}"),
        ],
    )


@router.get("/suppliers", response_model=list[SupplierOutput])
def list_suppliers(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    return db.scalars(select(Supplier).where(
        Supplier.company_id == company.id, Supplier.active.is_(True),
    ).order_by(Supplier.name)).all()


@router.post("/suppliers", response_model=SupplierOutput, status_code=201)
def create_supplier(payload: SupplierInput, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    supplier = Supplier(company_id=company.id, **payload.model_dump())
    db.add(supplier)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier code already exists for this company") from exc
    db.refresh(supplier)
    return supplier


@router.get("/purchases")
def list_purchases(db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    rows = db.scalars(select(Purchase).where(Purchase.company_id == company.id).order_by(Purchase.created_at.desc()).limit(500)).all()
    return [_purchase_json(db, row) for row in rows]


@router.get("/purchases/{purchase_id}")
def get_purchase(purchase_id: str, db: Session = Depends(get_db), _user: User = Depends(require_user)):
    company = _company(db)
    return _purchase_json(db, _purchase_or_404(db, company.id, purchase_id))


@router.post("/purchases", status_code=201)
def create_purchase(payload: PurchaseInput, db: Session = Depends(get_db), user: User = Depends(require_user)):
    """Post a supplier invoice and full goods receipt atomically; all arithmetic is server-owned."""
    company = _company(db)
    supplier = _supplier_or_404(db, company.id, payload.supplier_id)
    subtotal = discount_total = taxable_subtotal = vat_total = grand_total = ZERO
    prepared: list[tuple[Product, object, object, object]] = []

    try:
        for line in payload.lines:
            product = db.scalar(select(Product).where(
                Product.id == line.product_id, Product.company_id == company.id, Product.active.is_(True),
            ).with_for_update())
            if product is None:
                raise HTTPException(status_code=404, detail=f"Product not found: {line.product_id}")
            tax_rule = resolve_tax_rule(db, company.id, product.tax_category, product.vat_rate, reason=product.tax_reason)
            totals = calculate_line(
                quantity=line.quantity, unit_price=line.unit_cost, vat_rate=product.vat_rate,
                discount_percent=line.discount_percent,
                price_includes_vat=line.price_includes_vat,
            )
            subtotal += totals.gross_amount
            discount_total += totals.discount_amount
            taxable_subtotal += totals.taxable_amount
            vat_total += totals.vat_amount
            grand_total += totals.total_amount
            prepared.append((product, line, totals, tax_rule))

        subtotal, discount_total = money(subtotal), money(discount_total)
        taxable_subtotal, vat_total, grand_total = money(taxable_subtotal), money(vat_total), money(grand_total)
        paid = money(sum((item.amount for item in payload.payments), ZERO))
        if paid > grand_total:
            raise HTTPException(status_code=422, detail="Supplier payment cannot exceed the purchase total")
        if paid and grand_total == ZERO:
            raise HTTPException(status_code=422, detail="Cannot apply a payment to a zero-value purchase")
        status = "paid" if paid == grand_total else "partially_paid" if paid > ZERO else "unpaid"
        due_date = payload.due_date or (datetime.now(SAUDI_TZ).date() + timedelta(days=supplier.payment_terms_days))
        purchase = Purchase(
            company_id=company.id, supplier_id=supplier.id, purchase_number=payload.purchase_number.strip(),
            supplier_invoice_number=payload.supplier_invoice_number.strip(), supplier_name=supplier.name,
            status=status, subtotal=subtotal, discount_total=discount_total,
            taxable_subtotal=taxable_subtotal, vat_total=vat_total, total=grand_total,
            amount_paid=paid, due_date=due_date, created_by=user.id,
        )
        db.add(purchase)
        db.flush()

        for product, line, totals, tax_rule in prepared:
            before_quantity = product.quantity
            before_value = before_quantity * product.average_cost
            product.quantity = before_quantity + line.quantity
            if product.quantity > ZERO:
                product.average_cost = money((before_value + totals.taxable_amount) / product.quantity)
            db.add(PurchaseLine(
                purchase_id=purchase.id, product_id=product.id, sku=product.sku,
                description=product.name, quantity=line.quantity, unit_cost=line.unit_cost,
                discount_percent=line.discount_percent, discount_amount=totals.discount_amount,
                taxable_amount=totals.taxable_amount, tax_category=product.tax_category,
                tax_reason=product.tax_reason, tax_rule_code=tax_rule.code,
                tax_rule_version=tax_rule.version, vat_rate=product.vat_rate,
                vat_amount=totals.vat_amount, total_amount=totals.total_amount,
                price_includes_vat=line.price_includes_vat,
            ))
            db.add(InventoryMovement(
                company_id=company.id, product_id=product.id, invoice_id=None,
                purchase_id=purchase.id, user_id=user.id, movement_type="purchase_receipt",
                quantity_change=line.quantity, balance_after=product.quantity,
            ))

        journal_lines = [
            ("inventory", taxable_subtotal, ZERO, f"مخزون فاتورة {purchase.purchase_number}"),
            ("vat_input", vat_total, ZERO, "ضريبة مدخلات حسب المستند"),
            ("payable", ZERO, grand_total, f"مستحق المورد {supplier.name}"),
        ]
        post_journal(
            db, company_id=company.id, user_id=user.id, source_type="purchase",
            source_id=purchase.id, description=f"فاتورة مشتريات {purchase.purchase_number}",
            lines=journal_lines,
        )
        remaining_initial = paid
        for index, payment_data in enumerate(payload.payments):
            applied = min(money(payment_data.amount), remaining_initial)
            remaining_initial -= applied
            if applied <= ZERO:
                continue
            payment = PurchasePayment(
                purchase_id=purchase.id, method=payment_data.method, amount=applied,
                idempotency_key=f"{purchase.id}:initial:{index}", created_by=user.id,
            )
            db.add(payment)
            db.flush()
            _post_payment_journal(db, purchase=purchase, payment=payment, user=user)

        db.commit()
        db.refresh(purchase)
        return _purchase_json(db, purchase)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Purchase number or payment reference already exists") from exc
    except HTTPException:
        db.rollback()
        raise


@router.post("/purchases/{purchase_id}/payments")
def add_purchase_payment(
    purchase_id: str, payload: PurchasePaymentAddInput,
    db: Session = Depends(get_db), user: User = Depends(require_user),
):
    company = _company(db)
    try:
        previous = db.scalar(select(PurchasePayment).where(PurchasePayment.idempotency_key == payload.idempotency_key))
        if previous is not None:
            if previous.purchase_id != purchase_id:
                raise HTTPException(status_code=409, detail="Idempotency key was already used for another purchase")
            if previous.method != payload.method or money(previous.amount) != money(payload.amount):
                raise HTTPException(status_code=409, detail="Idempotency key was reused with a different payment payload")
            return _purchase_json(db, _purchase_or_404(db, company.id, purchase_id))
        purchase = _purchase_or_404(db, company.id, purchase_id, lock=True)
        outstanding = money(purchase.total - purchase.amount_paid)
        if payload.amount > outstanding:
            raise HTTPException(status_code=422, detail="Payment exceeds the supplier balance due")
        payment = PurchasePayment(
            purchase_id=purchase.id, method=payload.method, amount=money(payload.amount),
            idempotency_key=payload.idempotency_key, created_by=user.id,
        )
        db.add(payment)
        db.flush()
        _post_payment_journal(db, purchase=purchase, payment=payment, user=user)
        purchase.amount_paid = money(purchase.amount_paid + payment.amount)
        purchase.status = "paid" if purchase.amount_paid >= purchase.total else "partially_paid"
        db.commit()
        db.refresh(purchase)
        return _purchase_json(db, purchase)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Payment was already recorded; use a fresh idempotency key for a new payment") from exc
    except HTTPException:
        db.rollback()
        raise
