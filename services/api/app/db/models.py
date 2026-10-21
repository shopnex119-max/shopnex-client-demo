from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(60), nullable=False, default="Company Admin")
    permissions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="عام")
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("15.00"))
    tax_category: Mapped[str] = mapped_column(String(24), nullable=False, default="standard")
    tax_reason: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    tax_rule_id: Mapped[str | None] = mapped_column(ForeignKey("tax_rules.id", ondelete="RESTRICT"), nullable=True)
    price_includes_vat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    average_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("company_id", "sku", name="uq_products_company_sku"),)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    customer_name: Mapped[str] = mapped_column(String(240), default="عميل نقدي")
    invoice_type: Mapped[str] = mapped_column(String(40), default="simplified")
    status: Mapped[str] = mapped_column(String(40), default="draft")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    taxable_subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    vat_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    change_due: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="SAR")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    zatca_uuid: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)
    # Server-assigned, gapless per-company counter (ZATCA invoice counter value / ICV basis).
    sequence_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer_vat_number: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    customer_address: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    shift_id: Mapped[str | None] = mapped_column(ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    # Client-generated key so a retried checkout can never create a second invoice.
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (
        UniqueConstraint("company_id", "invoice_number", name="uq_invoice_company_number"),
        Index("uq_invoice_company_sequence", "company_id", "sequence_number", unique=True),
        Index("uq_invoice_company_idempotency", "company_id", "idempotency_key", unique=True),
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tax_category: Mapped[str] = mapped_column(String(24), nullable=False, default="standard")
    tax_reason: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    tax_rule_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    tax_rule_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    price_includes_vat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    method: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True, nullable=True)
    purchase_id: Mapped[str | None] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"), index=True, nullable=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity_change: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ZatcaSettings(Base):
    __tablename__ = "zatca_settings"
    __table_args__ = (UniqueConstraint("company_id", "environment", name="uq_zatca_company_environment"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    company_name: Mapped[str] = mapped_column(String(200), default="")
    vat_number: Mapped[str] = mapped_column(String(20), default="")
    egs_unit: Mapped[str] = mapped_column(String(120), default="")
    certificate_path: Mapped[str] = mapped_column(Text, default="")
    private_key_path: Mapped[str] = mapped_column(Text, default="")
    configured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    last_validation: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ZatcaDocument(Base):
    __tablename__ = "zatca_documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()))
    invoice_number: Mapped[str] = mapped_column(String(80), nullable=False)
    invoice_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    clearance_status: Mapped[str] = mapped_column(String(32), default="not_applicable")
    reporting_status: Mapped[str] = mapped_column(String(32), default="not_submitted")
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    xml_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    previous_invoice_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    qr_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ModuleRecord(Base):
    __tablename__ = "module_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    module: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (UniqueConstraint("company_id", "supplier_code", name="uq_supplier_company_code"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    supplier_code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    vat_number: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (UniqueConstraint("company_id", "purchase_number", name="uq_purchase_company_number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    purchase_number: Mapped[str] = mapped_column(String(80), nullable=False)
    supplier_invoice_number: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    supplier_name: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="unpaid")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    taxable_subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PurchaseLine(Base):
    __tablename__ = "purchase_lines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    purchase_id: Mapped[str] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_category: Mapped[str] = mapped_column(String(24), nullable=False, default="standard")
    tax_reason: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    tax_rule_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    tax_rule_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    price_includes_vat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class PurchasePayment(Base):
    __tablename__ = "purchase_payments"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_purchase_payment_idempotency_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    purchase_id: Mapped[str] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"), index=True)
    method: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AccountingAccount(Base):
    __tablename__ = "accounting_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_account_company_code"),
        UniqueConstraint("company_id", "system_key", name="uq_account_company_system_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    system_key: Mapped[str] = mapped_column(String(40), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    account_type: Mapped[str] = mapped_column(String(24), nullable=False)
    normal_side: Mapped[str] = mapped_column(String(6), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("company_id", "entry_number", name="uq_journal_company_number"),
        UniqueConstraint("company_id", "source_type", "source_id", name="uq_journal_source"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    entry_number: Mapped[str] = mapped_column(String(100), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="posted")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JournalLine(Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND (debit > 0 OR credit > 0)", name="ck_journal_line_one_side_positive"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    entry_id: Mapped[str] = mapped_column(ForeignKey("journal_entries.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounting_accounts.id", ondelete="RESTRICT"), index=True)
    memo: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))


class TaxRule(Base):
    __tablename__ = "tax_rules"
    __table_args__ = (UniqueConstraint("company_id", "code", "version", name="uq_tax_rule_company_code_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(Date, nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    reason_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DocumentCounter(Base):
    """Gapless per-company counters; rows are only advanced inside the issuing transaction."""
    __tablename__ = "document_counters"
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    series: Mapped[str] = mapped_column(String(32), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (
        UniqueConstraint("company_id", "shift_number", name="uq_shift_company_number"),
        # Database-level guarantee: one open shift per cashier.
        Index(
            "uq_shift_one_open_per_cashier", "cashier_id", unique=True,
            sqlite_where=text("status = 'open'"), postgresql_where=text("status = 'open'"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    shift_number: Mapped[int] = mapped_column(Integer, nullable=False)
    cashier_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    opening_float: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    counted_cash: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    expected_cash: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    variance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")


class CashMovement(Base):
    __tablename__ = "cash_movements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    shift_id: Mapped[str] = mapped_column(ForeignKey("shifts.id", ondelete="CASCADE"), index=True)
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(240), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
