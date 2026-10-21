from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import Base, Invoice
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
        del app.state.test_session_maker
        Base.metadata.drop_all(engine)
        engine.dispose()


def auth(client: TestClient) -> dict:
    result = client.post("/api/v1/auth/setup", json={
        "username": "owner", "display_name": "مدير", "password": "strong-local-password-2026",
    })
    assert result.status_code == 201, result.text
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def make_product(client: TestClient, headers: dict, sku="N-001", price="10.00", quantity="20.000") -> dict:
    response = client.post("/api/v1/products", headers=headers, json={
        "sku": sku, "name": f"صنف {sku}", "price": price, "quantity": quantity,
    })
    assert response.status_code == 201, response.text
    return response.json()


def sell(client, headers, product, quantity="1", payments=None, **extra):
    body = {
        "lines": [{"product_id": product["id"], "quantity": quantity}],
        "payments": payments if payments is not None else [{"method": "cash", "amount": "11.50"}],
        **extra,
    }
    return client.post("/api/v1/invoices", headers=headers, json=body)


def test_invoice_numbers_are_server_assigned_sequential_and_ignore_client_numbers(client: TestClient):
    headers = auth(client)
    product = make_product(client, headers)
    numbers = []
    for client_number in ("ANY-1", "ANY-1", None):  # a repeated or missing client number must not matter
        extra = {"invoice_number": client_number} if client_number else {}
        response = sell(client, headers, product, **extra)
        assert response.status_code == 201, response.text
        numbers.append((response.json()["invoice_number"], response.json()["sequence_number"]))
    assert numbers == [("INV-00000001", 1), ("INV-00000002", 2), ("INV-00000003", 3)]


def test_failed_sale_does_not_consume_an_invoice_number(client: TestClient):
    headers = auth(client)
    product = make_product(client, headers, quantity="2.000")
    assert sell(client, headers, product).json()["sequence_number"] == 1
    oversell = sell(client, headers, product, quantity="50")
    assert oversell.status_code == 409
    missing = client.post("/api/v1/invoices", headers=headers, json={
        "lines": [{"product_id": "does-not-exist", "quantity": "1"}], "payments": [],
    })
    assert missing.status_code == 404
    assert sell(client, headers, product).json()["sequence_number"] == 2  # no gap after two failures


def test_idempotency_key_prevents_duplicate_invoice_on_retry(client: TestClient):
    headers = auth(client)
    product = make_product(client, headers, quantity="5.000")
    first = sell(client, headers, product, idempotency_key="checkout-0001-abcdef")
    retry = sell(client, headers, product, idempotency_key="checkout-0001-abcdef")
    assert first.status_code == 201 and retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]
    assert len(client.get("/api/v1/invoices", headers=headers).json()) == 1
    assert Decimal(client.get("/api/v1/products", headers=headers).json()[0]["quantity"]) == Decimal("4.000")


def test_tax_invoice_requires_buyer_details_and_notes_cannot_use_sales_endpoint(client: TestClient):
    headers = auth(client)
    product = make_product(client, headers)
    walk_in = sell(client, headers, product, invoice_type="tax")
    assert walk_in.status_code == 422
    bad_vat = sell(client, headers, product, invoice_type="tax", customer_name="شركة الأمل", customer_vat_number="123")
    assert bad_vat.status_code == 422
    ok = sell(
        client, headers, product, invoice_type="tax", customer_name="شركة الأمل",
        customer_vat_number="310000000000003", customer_address="الرياض",
    )
    assert ok.status_code == 201, ok.text
    detail = client.get(f"/api/v1/invoices/{ok.json()['id']}", headers=headers).json()
    assert detail["customer_vat_number"] == "310000000000003" and detail["customer_address"] == "الرياض"
    with app.state.test_session_maker() as db:
        stored = db.scalar(select(Invoice).where(Invoice.id == ok.json()["id"]))
        assert stored.zatca_uuid and len(stored.zatca_uuid) == 36
    for note in ("credit_note", "debit_note"):
        assert sell(client, headers, product, invoice_type=note).status_code == 422


def test_shift_lifecycle_expected_cash_variance_and_blind_close(client: TestClient):
    owner = auth(client)
    product = make_product(client, owner, price="10.00")
    created = client.post("/api/v1/admin/users", headers=owner, json={
        "username": "cashier1", "display_name": "كاشير ١", "password": "cashier-password-2026", "role": "Cashier",
    })
    assert created.status_code == 201, created.text
    login = client.post("/api/v1/auth/login", json={"username": "cashier1", "password": "cashier-password-2026"})
    cashier = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.get("/api/v1/shifts/current", headers=cashier).json() == {"shift": None}
    opened = client.post("/api/v1/shifts/open", headers=cashier, json={"opening_float": "100.00"})
    assert opened.status_code == 201, opened.text
    assert opened.json()["shift_number"] == 1 and opened.json()["expected_cash"] is None  # blind for the cashier
    assert client.post("/api/v1/shifts/open", headers=cashier, json={"opening_float": "5"}).status_code == 409

    sale = sell(client, cashier, product, payments=[{"method": "cash", "amount": "20.00"}])  # total 11.50, change 8.50
    assert sale.status_code == 201 and sale.json()["shift_id"] == opened.json()["id"]
    card_sale = sell(client, cashier, product, payments=[{"method": "card", "amount": "11.50"}])
    assert card_sale.status_code == 201
    assert client.post("/api/v1/shifts/cash-movements", headers=cashier, json={
        "movement_type": "cash_out", "amount": "9999", "reason": "سحب كبير",
    }).status_code == 422
    assert client.post("/api/v1/shifts/cash-movements", headers=cashier, json={
        "movement_type": "cash_out", "amount": "30.00", "reason": "شراء مستلزمات",
    }).status_code == 201

    # opening 100 + cash sales 11.50 - withdrawal 30 = 81.50 expected; the cashier counts 80.00
    assert client.post("/api/v1/shifts/current/close", headers=cashier, json={"counted_cash": "80.00"}).status_code == 422
    closed = client.post("/api/v1/shifts/current/close", headers=cashier, json={
        "counted_cash": "80.00", "notes": "فرق ١.٥٠ فكة",
    })
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["status"] == "closed"
    assert Decimal(str(body["expected_cash"])) == Decimal("81.50")
    assert Decimal(str(body["variance"])) == Decimal("-1.50")
    assert Decimal(str(body["cash_sales"])) == Decimal("11.50") and Decimal(str(body["card_sales"])) == Decimal("11.50")
    assert body["invoice_count"] == 2 and len(body["invoices"]) == 2
    assert client.post("/api/v1/shifts/current/close", headers=cashier, json={"counted_cash": "1"}).status_code == 404

    # a manager sees every shift; the cashier only sees their own
    assert len(client.get("/api/v1/shifts", headers=owner).json()) == 1
    assert client.get(f"/api/v1/shifts/{body['id']}", headers=owner).status_code == 200
    assert client.get("/api/v1/shifts/not-a-shift", headers=cashier).status_code == 404


def test_require_open_shift_setting_blocks_sales_until_shift_is_opened(client: TestClient, monkeypatch):
    headers = auth(client)
    product = make_product(client, headers)
    monkeypatch.setattr(settings, "require_open_shift", True)
    blocked = sell(client, headers, product)
    assert blocked.status_code == 409
    assert client.get("/api/v1/invoices", headers=headers).json() == []
    assert client.post("/api/v1/shifts/open", headers=headers, json={"opening_float": "0"}).status_code == 201
    assert sell(client, headers, product).status_code == 201
