import base64
import re
from decimal import Decimal

from fastapi import HTTPException

from app.financial import ZERO, money

MAX_BASE64_CHARACTERS = 700


def build_phase1_tlv_qr(
    *, seller_name: str, vat_number: str, issued_at: str,
    total_including_vat: Decimal, vat_total: Decimal,
) -> tuple[str, list[dict[str, str | int]]]:
    """Build the five mandatory TLV fields used in the local Phase 1 QR preview.

    This intentionally does not emit Phase 2 cryptographic tags. Those values
    must come from the actual signed/cleared ZATCA invoice, never placeholders.
    """
    fields = [
        (1, seller_name.strip()),
        (2, vat_number.strip()),
        (3, issued_at.strip()),
        (4, f"{money(total_including_vat):.2f}"),
        (5, f"{money(vat_total):.2f}"),
    ]
    if any(not value for _, value in fields):
        raise HTTPException(status_code=422, detail="Seller details and invoice timestamp are required to build a QR payload")
    if not re.fullmatch(r"3\d{13}3", vat_number.strip()):
        raise HTTPException(status_code=422, detail="Saudi VAT registration number must contain 15 digits and begin/end with 3")
    if money(total_including_vat) < ZERO or money(vat_total) < ZERO or money(vat_total) > money(total_including_vat):
        raise HTTPException(status_code=422, detail="Invoice amounts are not valid for a QR payload")

    payload = bytearray()
    decoded: list[dict[str, str | int]] = []
    for tag, value in fields:
        value_bytes = value.encode("utf-8")
        if len(value_bytes) > 255:
            raise HTTPException(status_code=422, detail=f"TLV tag {tag} exceeds the one-byte length limit")
        payload.extend((tag, len(value_bytes)))
        payload.extend(value_bytes)
        decoded.append({"tag": tag, "length": len(value_bytes), "value": value})
    encoded = base64.b64encode(bytes(payload)).decode("ascii")
    if len(encoded) > MAX_BASE64_CHARACTERS:
        raise HTTPException(status_code=422, detail="QR payload exceeds the ZATCA technical size limit")
    return encoded, decoded
