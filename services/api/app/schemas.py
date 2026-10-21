from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ZatcaConfigInput(BaseModel):
    environment: str = "sandbox"
    company_name: str = Field(default="", max_length=200)
    vat_number: str = Field(default="", max_length=20)
    egs_unit: str = Field(default="", max_length=120)
    certificate_path: str = Field(default="", max_length=1024)
    private_key_path: str = Field(default="", max_length=1024)
    api_credential: str | None = Field(default=None, max_length=16384)

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        normalized = value.lower().strip()
        if normalized not in {"sandbox", "production"}:
            raise ValueError("environment must be sandbox or production")
        return normalized


class ZatcaConfigOutput(BaseModel):
    configured: bool
    environment: str
    company_name: str
    vat_number: str
    egs_unit: str
    certificate_path: str = ""
    private_key_path: str = ""
    secret_present: bool = False
    certificate_present: bool = False
    private_key_present: bool = False
    adapter_ready: bool = False
    last_validation: str | None = None


class ProductInput(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    category: str = Field(default="عام", max_length=120)
    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    vat_rate: Decimal = Field(default=Decimal("15.00"), ge=0, le=100, max_digits=5, decimal_places=2)
    tax_category: str = Field(default="standard", pattern="^(standard|zero_rated|exempt|out_of_scope)$")
    tax_reason: str = Field(default="", max_length=240)
    quantity: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)
    average_cost: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    price_includes_vat: bool = False

    @model_validator(mode="after")
    def check_tax_classification(self):
        if self.tax_category != "standard" and self.vat_rate != 0:
            raise ValueError("non-standard tax categories must use a zero VAT rate")
        if self.tax_category in {"exempt", "out_of_scope"} and not self.tax_reason.strip():
            raise ValueError("a tax reason is required for exempt or out-of-scope products")
        return self


class ProductOutput(ProductInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
    active: bool
    tax_rule_id: str | None = None


class InvoiceLineInput(BaseModel):
    product_id: str = Field(min_length=1, max_length=36)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)


class InvoicePaymentInput(BaseModel):
    method: str = Field(pattern="^(cash|card|bank_transfer|wallet|other|custom_[a-z0-9_]{1,100})$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class InvoiceInput(BaseModel):
    # Kept only for backward compatibility: the server always assigns the legal sequential number.
    invoice_number: str | None = Field(default=None, max_length=80)
    customer_name: str = Field(default="عميل نقدي", max_length=240)
    customer_vat_number: str = Field(default="", max_length=20)
    customer_address: str = Field(default="", max_length=300)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)
    invoice_type: str = Field(default="simplified", pattern="^(simplified|tax|credit_note|debit_note)$")
    lines: list[InvoiceLineInput] = Field(min_length=1, max_length=500)
    payments: list[InvoicePaymentInput] = Field(default_factory=list, max_length=20)


class InvoiceOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    invoice_number: str
    customer_name: str
    invoice_type: str
    status: str
    subtotal: Decimal
    discount_total: Decimal
    taxable_subtotal: Decimal
    vat_total: Decimal
    total: Decimal
    amount_paid: Decimal
    change_due: Decimal
    currency: str
    created_at: datetime
    sequence_number: int | None = None
    customer_vat_number: str = ""
    customer_address: str = ""
    shift_id: str | None = None


class InvoiceLineOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    description: str
    sku: str
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    vat_rate: Decimal
    tax_category: str
    tax_reason: str
    vat_amount: Decimal
    total_amount: Decimal
    price_includes_vat: bool


class InvoicePaymentOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    method: str
    amount: Decimal
    created_at: datetime


class InvoiceDetailOutput(InvoiceOutput):
    lines: list[InvoiceLineOutput] = Field(default_factory=list)
    payments: list[InvoicePaymentOutput] = Field(default_factory=list)


class SupplierInput(BaseModel):
    supplier_code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    vat_number: str = Field(default="", max_length=20)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=240)
    payment_terms_days: int = Field(default=30, ge=0, le=3650)
    credit_limit: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)


class SupplierOutput(SupplierInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
    active: bool


class PurchaseLineInput(BaseModel):
    product_id: str = Field(min_length=1, max_length=36)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
    price_includes_vat: bool = False


class PurchasePaymentInput(BaseModel):
    method: str = Field(pattern="^(cash|card|bank_transfer|wallet|other|custom_[a-z0-9_]{1,100})$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class PurchaseInput(BaseModel):
    purchase_number: str = Field(min_length=1, max_length=80)
    supplier_invoice_number: str = Field(default="", max_length=80)
    supplier_id: str = Field(min_length=1, max_length=36)
    due_date: date | None = None
    lines: list[PurchaseLineInput] = Field(min_length=1, max_length=500)
    payments: list[PurchasePaymentInput] = Field(default_factory=list, max_length=20)


class PurchasePaymentAddInput(BaseModel):
    method: str = Field(pattern="^(cash|card|bank_transfer|wallet|other|custom_[a-z0-9_]{1,100})$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    idempotency_key: str = Field(min_length=8, max_length=120)


class TaxRuleInput(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name_ar: str = Field(min_length=1, max_length=160)
    name_en: str = Field(min_length=1, max_length=160)
    category: str = Field(pattern="^(standard|zero_rated|exempt|out_of_scope)$")
    rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    effective_from: date
    effective_to: date | None = None
    reason_required: bool = False

    @model_validator(mode="after")
    def check_dates_and_rate(self):
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not be before effective_from")
        if self.category != "standard" and self.rate != 0:
            raise ValueError("non-standard tax categories must have a zero VAT rate")
        return self
