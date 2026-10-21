"""add invoice lines, payments and server-calculated totals

Revision ID: 9c31ef702ad4
Revises: 1a9d08f7c421
Create Date: 2026-10-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9c31ef702ad4"
down_revision: Union[str, Sequence[str], None] = "1a9d08f7c421"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("price_includes_vat", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("invoices", sa.Column("discount_total", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("invoices", sa.Column("taxable_subtotal", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("invoices", sa.Column("amount_paid", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("invoices", sa.Column("change_due", sa.Numeric(14, 2), nullable=False, server_default="0"))
    # Preserve useful historical totals where the earlier schema had no explicit base/paid fields.
    op.execute(sa.text("UPDATE invoices SET taxable_subtotal = subtotal"))
    op.execute(sa.text("UPDATE invoices SET amount_paid = total WHERE status = 'paid'"))
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=False),
        sa.Column("product_id", sa.String(36), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("taxable_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("price_includes_vat", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invoice_lines_invoice_id"), "invoice_lines", ["invoice_id"], unique=False)
    op.create_index(op.f("ix_invoice_lines_product_id"), "invoice_lines", ["product_id"], unique=False)
    op.create_table(
        "invoice_payments",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=False),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invoice_payments_invoice_id"), "invoice_payments", ["invoice_id"], unique=False)
    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("product_id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("movement_type", sa.String(32), nullable=False),
        sa.Column("quantity_change", sa.Numeric(14, 3), nullable=False),
        sa.Column("balance_after", sa.Numeric(14, 3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inventory_movements_company_id"), "inventory_movements", ["company_id"], unique=False)
    op.create_index(op.f("ix_inventory_movements_product_id"), "inventory_movements", ["product_id"], unique=False)
    op.create_index(op.f("ix_inventory_movements_invoice_id"), "inventory_movements", ["invoice_id"], unique=False)
    op.create_index(op.f("ix_inventory_movements_user_id"), "inventory_movements", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_movements_user_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_invoice_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_product_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_company_id"), table_name="inventory_movements")
    op.drop_table("inventory_movements")
    op.drop_index(op.f("ix_invoice_payments_invoice_id"), table_name="invoice_payments")
    op.drop_table("invoice_payments")
    op.drop_index(op.f("ix_invoice_lines_product_id"), table_name="invoice_lines")
    op.drop_index(op.f("ix_invoice_lines_invoice_id"), table_name="invoice_lines")
    op.drop_table("invoice_lines")
    op.drop_column("invoices", "change_due")
    op.drop_column("invoices", "amount_paid")
    op.drop_column("invoices", "taxable_subtotal")
    op.drop_column("invoices", "discount_total")
    op.drop_column("products", "price_includes_vat")
