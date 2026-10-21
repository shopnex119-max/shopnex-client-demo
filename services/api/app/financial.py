from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
ZERO = Decimal("0")
HUNDRED = Decimal("100")


def money(value: Decimal) -> Decimal:
    """Round a monetary value to Saudi halalas using commercial half-up rounding."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class LineTotals:
    gross_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal


def calculate_line(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    vat_rate: Decimal,
    discount_percent: Decimal = ZERO,
    price_includes_vat: bool = False,
) -> LineTotals:
    """Calculate one invoice line from catalog values; never use client totals.

    Each line is rounded once to the currency's minor unit. Inclusive-tax prices
    retain the entered gross price after discount; exclusive-tax prices add VAT.
    """
    gross = money(quantity * unit_price)
    discount = money(gross * discount_percent / HUNDRED)
    after_discount = gross - discount

    if price_includes_vat and vat_rate > ZERO:
        taxable = money(after_discount / (Decimal("1") + vat_rate / HUNDRED))
        vat = after_discount - taxable
        total = after_discount
    elif price_includes_vat:
        taxable = after_discount
        vat = ZERO
        total = after_discount
    else:
        taxable = after_discount
        vat = money(taxable * vat_rate / HUNDRED)
        total = taxable + vat

    return LineTotals(gross, discount, taxable, vat, total)
