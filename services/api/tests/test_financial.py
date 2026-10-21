from decimal import Decimal

from app.financial import calculate_line, money


def test_half_up_rounding_to_sar_minor_units():
    assert money(Decimal("1.005")) == Decimal("1.01")
    assert money(Decimal("1.004")) == Decimal("1.00")


def test_exclusive_vat_and_line_discount_are_calculated_before_tax():
    line = calculate_line(
        quantity=Decimal("2"),
        unit_price=Decimal("100.00"),
        vat_rate=Decimal("15.00"),
        discount_percent=Decimal("10.00"),
    )
    assert line.gross_amount == Decimal("200.00")
    assert line.discount_amount == Decimal("20.00")
    assert line.taxable_amount == Decimal("180.00")
    assert line.vat_amount == Decimal("27.00")
    assert line.total_amount == Decimal("207.00")


def test_inclusive_vat_preserves_gross_and_extracts_tax():
    line = calculate_line(
        quantity=Decimal("1"),
        unit_price=Decimal("115.00"),
        vat_rate=Decimal("15.00"),
        price_includes_vat=True,
    )
    assert line.taxable_amount == Decimal("100.00")
    assert line.vat_amount == Decimal("15.00")
    assert line.total_amount == Decimal("115.00")


def test_zero_rated_inclusive_price_has_no_vat():
    line = calculate_line(
        quantity=Decimal("1"),
        unit_price=Decimal("12.34"),
        vat_rate=Decimal("0"),
        price_includes_vat=True,
    )
    assert line.taxable_amount == Decimal("12.34")
    assert line.vat_amount == Decimal("0")
    assert line.total_amount == Decimal("12.34")
