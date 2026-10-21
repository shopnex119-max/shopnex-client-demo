from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.zatca import DEFAULT_COMPANY_ID
from app.db.models import (
    AccountingAccount, Base, Company, InventoryMovement, InvoicePayment, JournalEntry,
    ModuleRecord, Product, Purchase, PurchasePayment, Supplier, TaxRule, User,
    ZatcaDocument, ZatcaSettings,
)
from app.db.session import get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.state.test_session_maker = TestingSession
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.test_session_maker
    Base.metadata.drop_all(engine)
    engine.dispose()


def owner_token(client: TestClient) -> str:
    result = client.post("/api/v1/auth/setup", json={
        "username": "owner", "display_name": "مدير المنشأة", "password": "strong-local-password-2026",
    })
    assert result.status_code == 201, result.text
    return result.json()["access_token"]


def test_setup_is_single_use_and_business_data_requires_session(client: TestClient):
    assert client.get("/api/v1/auth/status").json()["setup_required"] is True
    assert client.get("/api/v1/products").status_code == 401
    owner_token(client)
    assert client.post("/api/v1/auth/login", json={
        "username": "owner", "password": "strong-local-password-2026",
    }).status_code == 200
    assert client.post("/api/v1/auth/login", json={
        "username": "owner", "password": "incorrect-local-password-2026",
    }).status_code == 401
    assert client.get("/api/v1/auth/status").json()["initialized"] is True
    assert client.post("/api/v1/auth/setup", json={
        "username": "other", "display_name": "Other", "password": "another-strong-password-2026",
    }).status_code == 409
    assert client.get("/api/v1/products").status_code == 401


def test_invoice_and_zatca_sensitive_routes_require_authenticated_session(client: TestClient):
    assert client.get("/api/v1/invoices").status_code == 401
    assert client.get("/api/v1/zatca/config").status_code == 401
    assert client.get("/api/v1/zatca/invoices/not-a-real-id/qr/phase1").status_code == 401


def test_product_creation_and_invoice_vat_rounding(client: TestClient):
    token = owner_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "SKU-100", "name": "صنف اختباري", "category": "عام", "price": "100.00", "vat_rate": "15.00", "quantity": "4.000",
    })
    assert product.status_code == 201, product.text
    assert product.json()["sku"] == "SKU-100"
    invoice = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-TEST-001", "customer_name": "عميل الاختبار", "invoice_type": "simplified",
        "lines": [{"product_id": product.json()["id"], "quantity": "2", "discount_percent": "0"}],
        "payments": [{"method": "cash", "amount": "250.00"}],
    })
    assert invoice.status_code == 201, invoice.text
    assert Decimal(invoice.json()["subtotal"]) == Decimal("200.00")
    assert Decimal(invoice.json()["vat_total"]) == Decimal("30.00")
    assert Decimal(invoice.json()["total"]) == Decimal("230.00")
    assert invoice.json()["status"] == "paid"
    assert Decimal(invoice.json()["change_due"]) == Decimal("20.00")
    assert Decimal(client.get("/api/v1/products", headers=headers).json()[0]["quantity"]) == Decimal("2.000")
    saved_invoices = client.get("/api/v1/invoices", headers=headers).json()
    assert len(saved_invoices) == 1
    assert saved_invoices[0]["created_at"]
    with app.state.test_session_maker() as db:
        movement = db.scalar(select(InventoryMovement).where(InventoryMovement.invoice_id == invoice.json()["id"]))
        assert movement.user_id
        assert movement.movement_type == "pos_sale"
        assert movement.quantity_change == Decimal("-2.000")
        assert movement.balance_after == Decimal("2.000")
        payment = db.scalar(select(InvoicePayment).where(InvoicePayment.invoice_id == invoice.json()["id"]))
        assert payment.amount == Decimal("230.00")
    trial = client.get("/api/v1/accounting/trial-balance", headers=headers)
    assert trial.status_code == 200 and trial.json()["balanced"] is True
    report = client.get("/api/v1/reports/overview", headers=headers)
    assert report.status_code == 200
    assert Decimal(str(report.json()["sales"]["total"])) == Decimal("230.00")
    assert report.json()["period"]["timezone"] == "Asia/Riyadh"


def test_invoice_price_and_tax_come_from_catalog_and_inclusive_prices_round_safely(client: TestClient):
    headers = {"Authorization": f"Bearer {owner_token(client)}"}
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "SKU-INCLUSIVE", "name": "سعر شامل", "price": "115.00", "vat_rate": "15.00",
        "quantity": "3.000", "price_includes_vat": True,
    })
    assert product.status_code == 201, product.text
    invoice = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-INCLUSIVE-001",
        "lines": [{"product_id": product.json()["id"], "quantity": "1", "unit_price": "0.01", "vat_rate": "0"}],
    })
    assert invoice.status_code == 201, invoice.text
    assert Decimal(invoice.json()["subtotal"]) == Decimal("115.00")
    assert Decimal(invoice.json()["taxable_subtotal"]) == Decimal("100.00")
    assert Decimal(invoice.json()["vat_total"]) == Decimal("15.00")
    assert Decimal(invoice.json()["total"]) == Decimal("115.00")


def test_invoice_rejects_oversell_without_creating_invoice(client: TestClient):
    headers = {"Authorization": f"Bearer {owner_token(client)}"}
    product = client.post("/api/v1/products", headers=headers, json={
        "sku": "SKU-LOW", "name": "مخزون قليل", "price": "10.00", "quantity": "1.000",
    })
    response = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-OVERSALE", "lines": [{"product_id": product.json()["id"], "quantity": "2"}],
    })
    assert response.status_code == 409
    assert client.get("/api/v1/invoices", headers=headers).json() == []


def test_zatca_config_is_local_and_external_connection_is_explicitly_disabled(client: TestClient):
    headers = {"Authorization": f"Bearer {owner_token(client)}"}
    saved = client.put("/api/v1/zatca/config", headers=headers, json={
        "environment": "sandbox", "company_name": "شركة اختبار", "vat_number": "310000000000003", "egs_unit": "EGS-LOCAL-001",
    })
    assert saved.status_code == 200, saved.text
    result = saved.json()
    assert result["configured"] is True
    assert result["adapter_ready"] is False
    assert "api_credential" not in result
    assert client.post("/api/v1/zatca/validate?environment=sandbox", headers=headers).json()["authority_contacted"] is False
    blocked = client.post("/api/v1/zatca/test-connection", headers=headers)
    assert blocked.status_code == 501
    assert "No authority request was sent" in blocked.json()["detail"]


def test_operational_reset_requires_password_and_preserves_setup_and_zatca(client: TestClient):
    headers = {"Authorization": f"Bearer {owner_token(client)}"}
    product_response = client.post("/api/v1/products", headers=headers, json={
        "sku": "RESET-001", "name": "منتج تصفير", "price": "20.00", "quantity": "4.000",
    })
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    invoice_response = client.post("/api/v1/invoices", headers=headers, json={
        "invoice_number": "INV-RESET-001",
        "lines": [{"product_id": product["id"], "quantity": "1", "discount_percent": "0"}],
        "payments": [{"method": "cash", "amount": "23.00"}],
    })
    assert invoice_response.status_code == 201, invoice_response.text
    invoice = invoice_response.json()

    supplier_response = client.post("/api/v1/suppliers", headers=headers, json={
        "supplier_code": "RESET-SUP-001", "name": "مورد تصفير",
    })
    assert supplier_response.status_code == 201, supplier_response.text
    supplier = supplier_response.json()
    purchase_response = client.post("/api/v1/purchases", headers=headers, json={
        "purchase_number": "PUR-RESET-001", "supplier_id": supplier["id"],
        "lines": [{"product_id": product["id"], "quantity": "2", "unit_cost": "5.00"}],
        "payments": [{"method": "cash", "amount": "5.75"}],
    })
    assert purchase_response.status_code == 201, purchase_response.text

    zatca = client.put("/api/v1/zatca/config", headers=headers, json={
        "environment": "sandbox", "company_name": "شركة محفوظة", "vat_number": "310000000000003", "egs_unit": "EGS-RESET-001",
    })
    assert zatca.status_code == 200 and zatca.json()["configured"] is True

    with app.state.test_session_maker() as db:
        company = db.get(Company, DEFAULT_COMPANY_ID)
        assert company is not None
        zatca_document = ZatcaDocument(
            company_id=company.id, invoice_id=invoice["id"], invoice_number=invoice["invoice_number"],
            invoice_type="simplified", status="draft",
        )
        db.add(zatca_document)
        db.add_all([
            ModuleRecord(company_id=company.id, module="crm", data={"name": "عميل يتم مسحه"}),
            ModuleRecord(company_id=company.id, module="restaurant", data={"type": "table", "name": "طاولة محفوظة"}),
            ModuleRecord(company_id=company.id, module="hr", data={"name": "موظف محفوظ"}),
        ])
        db.commit()
        zatca_document_id = zatca_document.id

    reset_url = "/api/v1/admin/reset-operational-data"
    assert client.post(reset_url, json={"current_password": "strong-local-password-2026"}).status_code == 401
    wrong_password = client.post(reset_url, headers=headers, json={"current_password": "incorrect-local-password-2026"})
    assert wrong_password.status_code == 401
    assert len(client.get("/api/v1/invoices", headers=headers).json()) == 1

    response = client.post(reset_url, headers=headers, json={"current_password": "strong-local-password-2026"})
    assert response.status_code == 200, response.text
    counts = response.json()["deleted_counts"]
    assert counts["invoices"] == 1
    assert counts["invoice_lines"] == 1
    assert counts["invoice_payments"] == 1
    assert counts["purchases"] == 1
    assert counts["purchase_lines"] == 1
    assert counts["purchase_payments"] == 1
    assert counts["products"] == 1
    assert counts["suppliers"] == 1
    assert counts["customers"] == 1
    assert client.get("/api/v1/invoices", headers=headers).json() == []
    assert client.get("/api/v1/products", headers=headers).json() == []
    assert client.get("/api/v1/purchases", headers=headers).json() == []
    assert client.get("/api/v1/suppliers", headers=headers).json() == []
    assert client.get("/api/v1/zatca/config?environment=sandbox", headers=headers).json()["configured"] is True

    with app.state.test_session_maker() as db:
        assert db.get(Company, DEFAULT_COMPANY_ID) is not None
        assert db.scalar(select(User).where(User.username == "owner")) is not None
        assert db.scalar(select(AccountingAccount.id).limit(1)) is not None
        assert db.scalar(select(TaxRule.id).limit(1)) is not None
        assert db.scalar(select(ZatcaSettings.id).limit(1)) is not None
        preserved_document = db.get(ZatcaDocument, zatca_document_id)
        assert preserved_document is not None and preserved_document.invoice_id is None
        assert db.scalar(select(ModuleRecord.id).where(ModuleRecord.module == "crm").limit(1)) is None
        retained_modules = db.scalars(select(ModuleRecord).where(ModuleRecord.module.in_(["restaurant", "hr"]))).all()
        assert len(retained_modules) == 2
        assert db.scalar(select(JournalEntry.id).limit(1)) is None
        assert db.scalar(select(Purchase.id).limit(1)) is None
        assert db.scalar(select(PurchasePayment.id).limit(1)) is None
        assert db.scalar(select(Product.id).limit(1)) is None
        assert db.scalar(select(Supplier.id).limit(1)) is None



def test_employee_accounts_enforce_module_permissions_and_admin_safety(client: TestClient):
    admin_headers = {"Authorization": f"Bearer {owner_token(client)}"}
    product = client.post("/api/v1/products", headers=admin_headers, json={
        "sku": "RBAC-001", "name": "منتج صلاحيات", "price": "10.00", "quantity": "5.000",
    })
    assert product.status_code == 201, product.text

    created = client.post("/api/v1/admin/users", headers=admin_headers, json={
        "username": "Cashier01", "display_name": "موظف كاشير", "password": "cashier-password-2026",
        "role": "Cashier", "permissions": ["dashboard.view", "sales.view", "sales.create", "inventory.view"],
    })
    assert created.status_code == 201, created.text
    assert created.json()["username"] == "cashier01"
    assert "password_hash" not in created.json()
    cashier_login = client.post("/api/v1/auth/login", json={"username": "cashier01", "password": "cashier-password-2026"})
    assert cashier_login.status_code == 200, cashier_login.text
    assert "sales.create" in cashier_login.json()["permissions"]
    cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['access_token']}"}

    assert client.get("/api/v1/invoices", headers=cashier_headers).status_code == 200
    sale = client.post("/api/v1/invoices", headers=cashier_headers, json={
        "invoice_number": "RBAC-INV-001", "lines": [{"product_id": product.json()["id"], "quantity": "1"}],
        "payments": [{"method": "cash", "amount": "11.50"}],
    })
    assert sale.status_code == 201, sale.text
    denied_product_write = client.post("/api/v1/products", headers=cashier_headers, json={
        "sku": "RBAC-002", "name": "ممنوع", "price": "1.00", "quantity": "1.000",
    })
    assert denied_product_write.status_code == 403
    assert client.get("/api/v1/reports/overview", headers=cashier_headers).status_code == 403
    assert client.get("/api/v1/admin/users", headers=cashier_headers).status_code == 403

    disabled = client.patch(f"/api/v1/admin/users/{created.json()['id']}", headers=admin_headers, json={"active": False})
    assert disabled.status_code == 200 and disabled.json()["active"] is False
    assert client.get("/api/v1/products", headers=cashier_headers).status_code == 401
    last_admin = client.get("/api/v1/admin/users", headers=admin_headers).json()[0]
    response = client.patch(f"/api/v1/admin/users/{last_admin['id']}", headers=admin_headers, json={"active": False})
    assert response.status_code == 409


def test_user_management_role_templates_and_keyless_offline_auth(client: TestClient):
    admin_headers = {"Authorization": f"Bearer {owner_token(client)}"}
    metadata = client.get("/api/v1/admin/users/meta", headers=admin_headers)
    assert metadata.status_code == 200
    roles = {item["name"]: set(item["permissions"]) for item in metadata.json()["roles"]}
    assert "sales.create" in roles["Cashier"]
    assert "inventory.manage" in roles["Warehouse"]
    assert "users.manage" in roles["Administrator"]
    assert client.get("/api/v1/license/status", headers=admin_headers).status_code == 404
