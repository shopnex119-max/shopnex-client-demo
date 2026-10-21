import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base
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
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def token_for(client: TestClient) -> str:
    response = client.post("/api/v1/auth/setup", json={
        "username": "owner", "display_name": "Local owner", "password": "strong-local-password-2026",
    })
    assert response.status_code == 201
    return response.json()["access_token"]


def test_restaurant_orders_and_tables_persist_and_update(client: TestClient):
    headers = {"Authorization": f"Bearer {token_for(client)}"}
    created = client.post("/api/v1/modules/restaurant/records", headers=headers, json={
        "data": {"type": "order", "name": "ORD-1001", "location": "Table 2", "amount": "87.5", "status": "new"},
    })
    assert created.status_code == 201, created.text
    record = created.json()
    assert record["data"]["amount"] == "87.50"
    updated = client.put(f"/api/v1/modules/restaurant/records/{record['id']}", headers=headers, json={
        "data": {**record["data"], "status": "preparing"},
    })
    assert updated.status_code == 200
    assert updated.json()["data"]["status"] == "preparing"
    table = client.post("/api/v1/modules/restaurant/records", headers=headers, json={
        "data": {"type": "table", "name": "Table 2", "seats": 4, "status": "available"},
    })
    assert table.status_code == 201
    assert len(client.get("/api/v1/modules/restaurant/records", headers=headers).json()) == 2


def test_crm_loyalty_and_hr_employee_records(client: TestClient):
    headers = {"Authorization": f"Bearer {token_for(client)}"}
    customer = client.post("/api/v1/modules/crm/records", headers=headers, json={
        "data": {"name": "Test customer", "phone": "0500000000", "email": "", "segment": "new", "points": 10, "total_spend": "0.00"},
    })
    assert customer.status_code == 201, customer.text
    assert customer.json()["data"]["points"] == 10
    employee = client.post("/api/v1/modules/hr/records", headers=headers, json={
        "data": {"name": "Test employee", "role": "Cashier", "department": "Retail", "phone": "", "status": "active"},
    })
    assert employee.status_code == 201, employee.text
    assert employee.json()["data"]["status"] == "active"
    assert len(client.get("/api/v1/modules/hr/records", headers=headers).json()) == 1


def test_module_data_requires_auth_and_rejects_invalid_values(client: TestClient):
    assert client.get("/api/v1/modules/hr/records").status_code == 401
    headers = {"Authorization": f"Bearer {token_for(client)}"}
    invalid = client.post("/api/v1/modules/restaurant/records", headers=headers, json={
        "data": {"type": "table", "name": "Table 1", "seats": 0, "status": "available"},
    })
    assert invalid.status_code == 422
    unknown = client.get("/api/v1/modules/payroll/records", headers=headers)
    assert unknown.status_code == 422
