"""add purchasing, accounting and tax foundations

Revision ID: 4b7e21c60a93
Revises: 9c31ef702ad4
Create Date: 2026-10-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4b7e21c60a93"
down_revision: Union[str, Sequence[str], None] = "9c31ef702ad4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _idx(table: str, column: str) -> None:
    op.create_index(op.f(f"ix_{table}_{column}"), table, [column], unique=False)


def upgrade() -> None:
    op.add_column("products", sa.Column("tax_category", sa.String(24), nullable=False, server_default="standard"))
    op.add_column("products", sa.Column("tax_reason", sa.String(240), nullable=False, server_default=""))
    op.add_column("products", sa.Column("average_cost", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("invoice_lines", sa.Column("unit_cost", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("invoice_lines", sa.Column("tax_category", sa.String(24), nullable=False, server_default="standard"))
    op.add_column("invoice_lines", sa.Column("tax_reason", sa.String(240), nullable=False, server_default=""))
    op.add_column("invoice_lines", sa.Column("tax_rule_code", sa.String(40), nullable=False, server_default=""))
    op.add_column("invoice_lines", sa.Column("tax_rule_version", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "suppliers",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("supplier_code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("vat_number", sa.String(20), nullable=False, server_default=""),
        sa.Column("phone", sa.String(40), nullable=False, server_default=""),
        sa.Column("email", sa.String(240), nullable=False, server_default=""),
        sa.Column("payment_terms_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("credit_limit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "supplier_code", name="uq_supplier_company_code"),
    )
    _idx("suppliers", "company_id")

    op.create_table(
        "purchases",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("supplier_id", sa.String(36), nullable=False),
        sa.Column("purchase_number", sa.String(80), nullable=False),
        sa.Column("supplier_invoice_number", sa.String(80), nullable=False, server_default=""),
        sa.Column("supplier_name", sa.String(240), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="unpaid"),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False),
        sa.Column("discount_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("taxable_subtotal", sa.Numeric(14, 2), nullable=False),
        sa.Column("vat_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "purchase_number", name="uq_purchase_company_number"),
    )
    for col in ("company_id", "supplier_id", "created_by"):
        _idx("purchases", col)

    op.create_table(
        "purchase_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("purchase_id", sa.String(36), nullable=False),
        sa.Column("product_id", sa.String(36), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("taxable_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_category", sa.String(24), nullable=False, server_default="standard"),
        sa.Column("tax_reason", sa.String(240), nullable=False, server_default=""),
        sa.Column("tax_rule_code", sa.String(40), nullable=False, server_default=""),
        sa.Column("tax_rule_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("price_includes_vat", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    _idx("purchase_lines", "purchase_id")
    _idx("purchase_lines", "product_id")

    op.create_table(
        "purchase_payments",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("purchase_id", sa.String(36), nullable=False),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_purchase_payment_idempotency_key"),
    )
    for col in ("purchase_id", "created_by"):
        _idx("purchase_payments", col)

    op.create_table(
        "accounting_accounts",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("system_key", sa.String(40), nullable=False),
        sa.Column("name_ar", sa.String(160), nullable=False),
        sa.Column("name_en", sa.String(160), nullable=False),
        sa.Column("account_type", sa.String(24), nullable=False),
        sa.Column("normal_side", sa.String(6), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "code", name="uq_account_company_code"),
        sa.UniqueConstraint("company_id", "system_key", name="uq_account_company_system_key"),
    )
    _idx("accounting_accounts", "company_id")

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("entry_number", sa.String(100), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_id", sa.String(36), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="posted"),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "entry_number", name="uq_journal_company_number"),
        sa.UniqueConstraint("company_id", "source_type", "source_id", name="uq_journal_source"),
    )
    for col in ("company_id", "created_by"):
        _idx("journal_entries", col)

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("entry_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), nullable=False),
        sa.Column("memo", sa.String(240), nullable=False, server_default=""),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.CheckConstraint("debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND (debit > 0 OR credit > 0)", name="ck_journal_line_one_side_positive"),
        sa.ForeignKeyConstraint(["entry_id"], ["journal_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounting_accounts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    _idx("journal_lines", "entry_id")
    _idx("journal_lines", "account_id")

    op.create_table(
        "tax_rules",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name_ar", sa.String(160), nullable=False),
        sa.Column("name_en", sa.String(160), nullable=False),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("reason_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "code", "version", name="uq_tax_rule_company_code_version"),
    )
    _idx("tax_rules", "company_id")

    with op.batch_alter_table("products") as batch:
        batch.add_column(sa.Column("tax_rule_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_products_tax_rule_id_tax_rules", "tax_rules", ["tax_rule_id"], ["id"], ondelete="RESTRICT")

    with op.batch_alter_table("inventory_movements") as batch:
        batch.alter_column("invoice_id", existing_type=sa.String(36), nullable=True)
        batch.add_column(sa.Column("purchase_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_inventory_movements_purchase_id_purchases", "purchases", ["purchase_id"], ["id"], ondelete="CASCADE")
        batch.create_index(op.f("ix_inventory_movements_purchase_id"), ["purchase_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.drop_constraint("fk_products_tax_rule_id_tax_rules", type_="foreignkey")
        batch.drop_column("tax_rule_id")
    with op.batch_alter_table("inventory_movements") as batch:
        batch.drop_index(op.f("ix_inventory_movements_purchase_id"))
        batch.drop_constraint("fk_inventory_movements_purchase_id_purchases", type_="foreignkey")
        batch.drop_column("purchase_id")
        batch.alter_column("invoice_id", existing_type=sa.String(36), nullable=False)
    op.drop_index(op.f("ix_tax_rules_company_id"), table_name="tax_rules")
    op.drop_table("tax_rules")
    op.drop_index(op.f("ix_journal_lines_account_id"), table_name="journal_lines")
    op.drop_index(op.f("ix_journal_lines_entry_id"), table_name="journal_lines")
    op.drop_table("journal_lines")
    for col in ("created_by", "company_id"):
        op.drop_index(op.f(f"ix_journal_entries_{col}"), table_name="journal_entries")
    op.drop_table("journal_entries")
    op.drop_index(op.f("ix_accounting_accounts_company_id"), table_name="accounting_accounts")
    op.drop_table("accounting_accounts")
    for col in ("created_by", "company_id"):
        op.drop_index(op.f(f"ix_purchase_payments_{col}"), table_name="purchase_payments")
    op.drop_table("purchase_payments")
    op.drop_index(op.f("ix_purchase_lines_product_id"), table_name="purchase_lines")
    op.drop_index(op.f("ix_purchase_lines_purchase_id"), table_name="purchase_lines")
    op.drop_table("purchase_lines")
    for col in ("created_by", "supplier_id", "company_id"):
        op.drop_index(op.f(f"ix_purchases_{col}"), table_name="purchases")
    op.drop_table("purchases")
    op.drop_index(op.f("ix_suppliers_company_id"), table_name="suppliers")
    op.drop_table("suppliers")
    op.drop_column("products", "average_cost")
    op.drop_column("products", "tax_reason")
    op.drop_column("products", "tax_category")
    for column in ("tax_rule_version", "tax_rule_code", "tax_reason", "tax_category", "unit_cost"):
        op.drop_column("invoice_lines", column)
