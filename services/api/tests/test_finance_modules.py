import base64
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base, InventoryMovement, JournalEntry, JournalLine, PurchasePayment
from app.db.session import get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.state.test_session_maker = testing_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        if hasattr(app.state, "test_session_maker"):
            del app.state.test_session_maker
        Base.metadata.drop_all(engine)
        engine.dispose()


def auth(client: TestClient) -> dict[str, str]:
    setup = client.post("/api/v1/auth/setup", json={
        "username": "owner", "display_name": "مدير", "password": "strong-local-password-2026",
    })
    assert setup.status_code == 201, setup.text
    return {"Authorization": f"Bearer {setup.json()['access_token']}"}


def test_purchase_receipt_payments_tax_and_accounting_are_atomic(client: TestClient):
    headers = auth(client)
    product_response = client.post("/api/v1/products", headers=headers, json={
        "sku": "BUY-001", "name": "منتج شراء", "price": "12.00", "vat_rate": "15.00",
        "quantity": "10.000", "average_cost": "4.00",
    })
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    supplier_response = client.post("/api/v1/suppliers", headers=headers, json={
        "supplier_code": "SUP-001", "name": "مورد الاختبار", "payment_terms_days": 30,
    })
    assert supplier_response.status_code == 201, supplier_response.text

    purchase_response = client.post("/api/v1/purchases", headers=headers, json={
        "purchase_number": "PUR-TEST-001", "supplier_invoice_number": "SI-9381",
        "supplier_id": supplier_response.json()["id"],
        "lines": [{"product_id": product["id"], "quantity": "2.000", "unit_cost": "5.00"}],
        "payments": [{"method": "bank_transfer", "amount": "5.00"}],
    })
    assert purchase_response.status_code == 201, purchase_response.text
    purchase = purchase_response.json()
    assert Decimal(str(purchase["taxable_subtotal"])) == Decimal("10.00")
    assert Decimal(str(purchase["vat_total"])) == Decimal("1.50")
    assert Decimal(str(purchase["total"])) == Decimal("11.50")
    assert Decimal(str(purchase["amount_paid"])) == Decimal("5.00")
    assert Decimal(str(purchase["balance_due"])) == Decimal("6.50")
    assert purchase["status"] == "partially_paid"
    assert Decimal(client.get("/api/v1/products", headers=headers).json()[0]["quantity"]) == Decimal("12.000")
    assert Decimal(client.get("/api/v1/products", headers=headers).json()[0]["average_cost"]) == Decimal("4.17")

    with app.state.test_session_maker() as db:
        movement = db.scalar(select(InventoryMovement).where(InventoryMovement.purchase_id == purchase["id"]))
        assert movement is not None
        assert movement.movement_type == "purchase_receipt"
        assert movement.quantity_change == Decimal("2.000")
        assert movement.balance_after == Decimal("12.000")
        source_entry = db.scalar(select(JournalEntry).where(JournalEntry.source_type == "purchase", JournalEntry.source_id == purchase["id"]))
        assert source_entry is not None and source_entry.status == "posted"
        entry_lines = db.scalars(select(JournalLine).where(JournalLine.entry_id == source_entry.id)).all()
        assert sum((line.debit for line in entry_lines), Decimal("0")) == sum((line.credit for line in entry_lines), Decimal("0"))

    pay_body = {"method": "cash", "amount": "5.00", "idempotency_key": "pay-test-key-0001"}
    first = client.post(f"/api/v1/purchases/{purchase['id']}/payments", headers=headers, json=pay_body)
    retry = client.post(f"/api/v1/purchases/{purchase['id']}/payments", headers=headers, json=pay_body)
    assert first.status_code == 200, first.text
    assert retry.status_code == 200, retry.text
    assert Decimal(str(first.json()["balance_due"])) == Decimal("1.50")
    assert Decimal(str(retry.json()["balance_due"])) == Decimal("1.50")
    mismatched_retry = client.post(f"/api/v1/purchases/{purchase['id']}/payments", headers=headers, json={
        "method": "cash", "amount": "4.99", "idempotency_key": "pay-test-key-0001",
    })
    assert mismatched_retry.status_code == 409
    paid = client.post(f"/api/v1/purchases/{purchase['id']}/payments", headers=headers, json={
        "method": "cash", "amount": "1.50", "idempotency_key": "pay-test-key-0002",
    })
    assert paid.status_code == 200, paid.text
    assert paid.json()["status"] == "paid"
    assert Decimal(str(paid.json()["balance_due"])) == Decimal("0.00")

    trial = client.get("/api/v1/accounting/trial-balance", headers=headers)
    assert trial.status_code == 200, trial.text
    assert trial.json()["balanced"] is True
    with app.state.test_session_maker() as db:
        payments = db.scalars(select(PurchasePayment).where(PurchasePayment.purchase_id == purchase["id"])).all()
        assert len(payments) == 3  # initial receipt payment + two unique follow-up payments
    report = client.get("/api/v1/reports/overview", headers=headers)
    assert report.status_code == 200, report.text
    assert report.json()["purchases"]["count"] == 1
    assert Decimal(str(report.json()["purchases"]["vat"])) == Decimal("1.50")
    csv_response = client.get("/api/v1/reports/overview.csv", headers=headers)
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert csv_response.content.startswith(b"\xef\xbb\xbf")


def test_purchase_overpayment_rolls_back_receipt_and_journal(client: TestClient):
    headers = auth(client)
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "BUY-002", "name": "منتج آخر", "price": "10.00", "quantity": "1.000",
    }).json()
    supplier = client.post("/api/v1/suppliers", headers=headers, json={
        "supplier_code": "SUP-002", "name": "مورد آخر",
    }).json()
    response = client.post("/api/v1/purchases", headers=headers, json={
        "purchase_number": "PUR-OVERPAY", "supplier_id": supplier["id"],
        "lines": [{"product_id": product["id"], "quantity": "2", "unit_cost": "1.00"}],
        "payments": [{"method": "cash", "amount": "99.00"}],
    })
    assert response.status_code == 422
    assert client.get("/api/v1/purchases", headers=headers).json() == []
    assert Decimal(client.get("/api/v1/products", headers=headers).json()[0]["quantity"]) == Decimal("1.000")
    assert client.get("/api/v1/accounting/journals", headers=headers).json() == []


def test_invoice_detail_returns_persisted_lines_and_payments(client: TestClient):
    headers = auth(client)
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "PRINT-001", "name": "صنف للطباعة", "price": "12.34", "quantity": "3.000",
    }).json()
    created = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-PRINT-001",
        "customer_name": "عميل اختبار",
        "lines": [{"product_id": product["id"], "quantity": "2.000", "discount_percent": "5.00"}],
        "payments": [{"method": "cash", "amount": "26.99"}],
    })
    assert created.status_code == 201, created.text

    detail = client.get(f"/api/v1/invoices/{created.json()['id']}", headers=headers)
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["invoice_number"] == "INV-00000001"  # the server, not the client, assigns the number
    assert payload["sequence_number"] == 1
    assert payload["customer_name"] == "عميل اختبار"
    assert len(payload["lines"]) == 1
    assert payload["lines"][0]["sku"] == "PRINT-001"
    assert Decimal(str(payload["lines"][0]["quantity"])) == Decimal("2.000")
    assert Decimal(str(payload["lines"][0]["discount_amount"])) == Decimal("1.23")
    assert Decimal(str(payload["lines"][0]["vat_amount"])) == Decimal("3.52")
    assert len(payload["payments"]) == 1
    assert Decimal(str(payload["payments"][0]["amount"])) == Decimal("26.97")
    assert Decimal(str(payload["change_due"])) == Decimal("0.02")

    missing = client.get("/api/v1/invoices/not-a-real-invoice", headers=headers)
    assert missing.status_code == 404


def test_cashier_handover_attributes_sales_and_does_not_double_subtract_change(client: TestClient):
    headers = auth(client)
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "HANDOVER-001", "name": "صنف التسليم", "price": "10.00", "quantity": "10.000",
    }).json()
    first = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-HANDOVER-001",
        "lines": [{"product_id": product["id"], "quantity": "1"}],
        "payments": [{"method": "cash", "amount": "20.00"}],
    })
    second = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-HANDOVER-002",
        "lines": [{"product_id": product["id"], "quantity": "1"}],
        "payments": [{"method": "card", "amount": "5.00"}, {"method": "bank_transfer", "amount": "6.50"}],
    })
    assert first.status_code == 201 and second.status_code == 201
    report = client.get("/api/v1/reports/cashier-handover", headers=headers)
    assert report.status_code == 200, report.text
    payload = report.json()
    assert len(payload["cashiers"]) == 1
    cashier = payload["cashiers"][0]
    assert cashier["cashier_name"] == "مدير"
    assert cashier["invoice_count"] == 2
    assert Decimal(str(cashier["gross_sales"])) == Decimal("23.00")
    assert Decimal(str(cashier["cash"])) == Decimal("11.50")
    assert Decimal(str(cashier["cash_change"])) == Decimal("8.50")
    assert Decimal(str(cashier["cash_expected"])) == Decimal("11.50")
    assert Decimal(str(cashier["card"])) == Decimal("5.00")
    assert Decimal(str(cashier["bank_transfer"])) == Decimal("6.50")
    assert len(cashier["invoices"]) == 2
    invalid = client.get("/api/v1/reports/cashier-handover?start_date=2026-10-13&end_date=2026-10-12", headers=headers)
    assert invalid.status_code == 422

def test_zatca_phase1_qr_tlv_preview_uses_five_official_fields_without_phase2_claim(client: TestClient):
    headers = auth(client)
    config = client.put("/api/v1/zatca/config", headers=headers, json={
        "environment": "sandbox", "company_name": "شركة تجربة", "vat_number": "310000000000003", "egs_unit": "EGS-TEST",
    })
    assert config.status_code == 200, config.text
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "QR-001", "name": "منتج QR", "price": "100.00", "quantity": "2.000",
    }).json()
    invoice = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-QR-001", "lines": [{"product_id": product["id"], "quantity": "1"}],
    })
    assert invoice.status_code == 201, invoice.text
    response = client.get(f"/api/v1/zatca/invoices/{invoice.json()['id']}/qr/phase1", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["phase2_ready"] is False
    assert payload["authority_contacted"] is False
    assert payload["seller_name"] == "شركة تجربة"
    assert payload["vat_number"] == "310000000000003"
    assert [item["tag"] for item in payload["tags"]] == [1, 2, 3, 4, 5]
    decoded = base64.b64decode(payload["qr_base64"])
    fields = {}
    offset = 0
    while offset < len(decoded):
        tag, length = decoded[offset], decoded[offset + 1]
        offset += 2
        fields[tag] = decoded[offset:offset + length].decode("utf-8")
        offset += length
    assert fields[1] == "شركة تجربة"
    assert fields[2] == "310000000000003"
    assert fields[4] == "115.00"
    assert fields[5] == "15.00"
    assert "Phase 2" in payload["disclaimer"]


def test_tax_rule_versions_prevent_overlap_and_enforce_reason_required(client: TestClient):
    from datetime import date

    headers = auth(client)
    effective_from = date.today().isoformat()
    versioned = client.post("/api/v1/tax/rules", headers=headers, json={
        "code": "SHOPNEX-STD-15", "name_ar": "قياسي محدث", "name_en": "Updated standard",
        "category": "standard", "rate": "15.00", "effective_from": effective_from,
        "reason_required": True,
    })
    assert versioned.status_code == 201, versioned.text
    assert versioned.json()["version"] == 2
    overlap = client.post("/api/v1/tax/rules", headers=headers, json={
        "code": "CUSTOM-STD-15", "name_ar": "قياسي آخر", "name_en": "Another standard",
        "category": "standard", "rate": "15.00", "effective_from": effective_from,
    })
    assert overlap.status_code == 409

    rejected = client.post("/api/v1/products", headers=headers, json={
        "sku": "TAX-REASON-FAIL", "name": "منتج يحتاج سبب", "price": "1.00",
        "vat_rate": "15.00", "quantity": "0",
    })
    assert rejected.status_code == 422
    accepted = client.post("/api/v1/products", headers=headers, json={
        "sku": "TAX-REASON-OK", "name": "منتج موثق", "price": "1.00",
        "vat_rate": "15.00", "quantity": "0", "tax_reason": "معاملة موثقة",
    })
    assert accepted.status_code == 201, accepted.text
