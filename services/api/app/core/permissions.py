"""Role templates and API-level permission mapping for the local desktop app."""
import json
from typing import Iterable

from fastapi import HTTPException, Request

from app.db.models import User

ADMIN_ROLES = frozenset({"super admin", "company admin", "admin", "owner", "administrator"})

PERMISSION_CATALOG = [
    {"key": "dashboard.view", "group": "dashboard", "ar": "لوحة المعلومات", "en": "Dashboard"},
    {"key": "sales.view", "group": "sales", "ar": "عرض المبيعات والفواتير", "en": "View sales & invoices"},
    {"key": "sales.create", "group": "sales", "ar": "تسجيل عمليات البيع", "en": "Record sales"},
    {"key": "inventory.view", "group": "inventory", "ar": "عرض المنتجات والمخزون", "en": "View products & inventory"},
    {"key": "inventory.manage", "group": "inventory", "ar": "إدارة المنتجات والمخزون والجرد", "en": "Manage products, stock & counts"},
    {"key": "purchasing.view", "group": "purchasing", "ar": "عرض المشتريات والموردين", "en": "View purchases & suppliers"},
    {"key": "purchasing.manage", "group": "purchasing", "ar": "تسجيل المشتريات والمدفوعات", "en": "Create purchases & payments"},
    {"key": "accounting.view", "group": "accounting", "ar": "عرض المحاسبة والتقارير المالية", "en": "View accounting & financial reports"},
    {"key": "accounting.manage", "group": "accounting", "ar": "إدارة القواعد الضريبية والحسابات", "en": "Manage tax rules & accounts"},
    {"key": "reports.view", "group": "reports", "ar": "عرض التقارير والتحليلات", "en": "View reports & analytics"},
    {"key": "crm.view", "group": "crm", "ar": "عرض العملاء والموردين", "en": "View customers & contacts"},
    {"key": "crm.manage", "group": "crm", "ar": "إدارة العملاء والسجلات", "en": "Manage customers & records"},
    {"key": "restaurant.view", "group": "restaurant", "ar": "عرض المطعم والمطبخ", "en": "View restaurant & kitchen"},
    {"key": "restaurant.manage", "group": "restaurant", "ar": "إدارة المطعم والطلبات", "en": "Manage restaurant & orders"},
    {"key": "hr.view", "group": "hr", "ar": "عرض الموظفين", "en": "View employees"},
    {"key": "hr.manage", "group": "hr", "ar": "إدارة الموظفين والسجلات", "en": "Manage employees & records"},
    {"key": "zatca.view", "group": "zatca", "ar": "عرض إعدادات الفوترة الإلكترونية", "en": "View e-invoicing settings"},
    {"key": "zatca.manage", "group": "zatca", "ar": "إدارة إعدادات الفوترة الإلكترونية", "en": "Manage e-invoicing settings"},
    {"key": "settings.view", "group": "settings", "ar": "عرض الإعدادات", "en": "View settings"},
    {"key": "settings.manage", "group": "settings", "ar": "إدارة إعدادات النظام الحساسة", "en": "Manage sensitive system settings"},
    {"key": "users.manage", "group": "users", "ar": "إدارة المستخدمين والصلاحيات", "en": "Manage users & permissions"},
]
ALL_PERMISSIONS = frozenset(item["key"] for item in PERMISSION_CATALOG)

ROLE_NAMES = {
    "Administrator": "administrator",
    "Manager": "manager",
    "Accountant": "accountant",
    "Warehouse": "warehouse",
    "Cashier": "cashier",
    "Custom": "custom",
}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "administrator": ALL_PERMISSIONS,
    "manager": frozenset({
        "dashboard.view", "sales.view", "sales.create", "inventory.view", "inventory.manage",
        "purchasing.view", "purchasing.manage", "accounting.view", "accounting.manage", "reports.view",
        "crm.view", "crm.manage", "restaurant.view", "restaurant.manage", "hr.view", "hr.manage",
        "zatca.view", "zatca.manage", "settings.view",
    }),
    "accountant": frozenset({
        "dashboard.view", "sales.view", "purchasing.view", "accounting.view", "accounting.manage",
        "reports.view", "zatca.view", "settings.view",
    }),
    "warehouse": frozenset({
        "dashboard.view", "inventory.view", "inventory.manage", "purchasing.view", "purchasing.manage",
    }),
    "cashier": frozenset({"dashboard.view", "sales.view", "sales.create", "inventory.view"}),
    "custom": frozenset({"dashboard.view"}),
}


def is_admin_role(role: str) -> bool:
    return role.strip().casefold() in ADMIN_ROLES


def permissions_for_user(user: User) -> set[str]:
    if is_admin_role(user.role):
        return set(ALL_PERMISSIONS)
    if user.permissions_json is not None:
        try:
            values = json.loads(user.permissions_json)
            if isinstance(values, list):
                return {str(value) for value in values if value in ALL_PERMISSIONS}
        except (TypeError, ValueError):
            return set()
        return set()
    return set(ROLE_PERMISSIONS.get(user.role.strip().casefold(), ROLE_PERMISSIONS["custom"]))


def permission_granted(user: User, required: str) -> bool:
    grants = permissions_for_user(user)
    if required in grants:
        return True
    # A manage grant includes read access to the same feature.
    if required.endswith(".view") and required[:-5] + ".manage" in grants:
        return True
    return False


def permissions_for_role(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role.strip().casefold(), ROLE_PERMISSIONS["custom"]))


def validate_permissions(values: Iterable[str]) -> list[str]:
    normalized = sorted(set(values))
    unknown = set(normalized) - ALL_PERMISSIONS
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permissions: {', '.join(sorted(unknown))}")
    # Management implies view in the saved list as well, keeping UI states predictable.
    for value in list(normalized):
        if value.endswith(".manage"):
            view = value[:-7] + ".view"
            if view in ALL_PERMISSIONS and view not in normalized:
                normalized.append(view)
    return sorted(set(normalized))


def permission_for_request(request: Request) -> str | None:
    path = request.url.path
    method = request.method.upper()
    if path == "/api/v1/auth/me":
        return None
    if path.startswith("/api/v1/admin/users"):
        return "users.manage"
    if path == "/api/v1/admin/reset-operational-data":
        return "settings.manage"
    if path.startswith("/api/v1/reports/"):
        return "reports.view"
    if path.startswith("/api/v1/accounting/"):
        return "accounting.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else "accounting.view"
    if path.startswith("/api/v1/tax/rules"):
        return "accounting.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else "accounting.view"
    if path.startswith("/api/v1/invoices"):
        return "sales.create" if method in {"POST", "PUT", "PATCH", "DELETE"} else "sales.view"
    if path.startswith("/api/v1/shifts"):
        return "sales.create" if method in {"POST", "PUT", "PATCH", "DELETE"} else "sales.view"
    if path.startswith("/api/v1/products"):
        return "inventory.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else "inventory.view"
    if path.startswith("/api/v1/purchases") or path.startswith("/api/v1/suppliers"):
        return "purchasing.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else "purchasing.view"
    if path.startswith("/api/v1/modules/"):
        parts = path.split("/")
        module = parts[4] if len(parts) > 4 else ""
        group = {"crm": "crm", "hr": "hr", "restaurant": "restaurant"}.get(module)
        if group:
            return f"{group}.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else f"{group}.view"
    if path.startswith("/api/v1/zatca/"):
        return "zatca.manage" if method in {"POST", "PUT", "PATCH", "DELETE"} else "zatca.view"
    # Fail closed for future authenticated endpoints until a policy is explicitly assigned.
    return "users.manage"


def enforce_request_permission(request: Request, user: User) -> None:
    required = permission_for_request(request)
    if required and not permission_granted(user, required):
        raise HTTPException(status_code=403, detail=f"Permission required: {required}")
