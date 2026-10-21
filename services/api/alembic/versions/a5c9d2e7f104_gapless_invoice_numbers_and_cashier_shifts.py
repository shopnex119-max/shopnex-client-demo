"""gapless invoice numbering, buyer fields, idempotency and cashier shifts"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a5c9d2e7f104"
down_revision: Union[str, Sequence[str], None] = "e3a1c8f90b24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_counters",
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("series", sa.String(length=32), primary_key=True),
        sa.Column("next_value", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "shifts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_number", sa.Integer(), nullable=False),
        sa.Column("cashier_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="open"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opening_float", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("counted_cash", sa.Numeric(14, 2), nullable=True),
        sa.Column("expected_cash", sa.Numeric(14, 2), nullable=True),
        sa.Column("variance", sa.Numeric(14, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.UniqueConstraint("company_id", "shift_number", name="uq_shift_company_number"),
    )
    op.create_index("ix_shifts_company_id", "shifts", ["company_id"])
    op.create_index("ix_shifts_cashier_id", "shifts", ["cashier_id"])
    op.create_index(
        "uq_shift_one_open_per_cashier", "shifts", ["cashier_id"], unique=True,
        sqlite_where=sa.text("status = 'open'"), postgresql_where=sa.text("status = 'open'"),
    )
    op.create_table(
        "cash_movements",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("shift_id", sa.String(length=36), sa.ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movement_type", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cash_movements_shift_id", "cash_movements", ["shift_id"])
    op.create_index("ix_cash_movements_created_by", "cash_movements", ["created_by"])

    # Same pattern as the earlier created_by migration: nullable/defaulted columns, FK enforced by the ORM model.
    op.add_column("invoices", sa.Column("sequence_number", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("customer_vat_number", sa.String(length=20), nullable=False, server_default=""))
    op.add_column("invoices", sa.Column("customer_address", sa.String(length=300), nullable=False, server_default=""))
    op.add_column("invoices", sa.Column("shift_id", sa.String(length=36), nullable=True))
    op.add_column("invoices", sa.Column("idempotency_key", sa.String(length=120), nullable=True))
    op.create_index("ix_invoices_shift_id", "invoices", ["shift_id"])
    op.create_index("uq_invoice_company_sequence", "invoices", ["company_id", "sequence_number"], unique=True)
    op.create_index("uq_invoice_company_idempotency", "invoices", ["company_id", "idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_invoice_company_idempotency", table_name="invoices")
    op.drop_index("uq_invoice_company_sequence", table_name="invoices")
    op.drop_index("ix_invoices_shift_id", table_name="invoices")
    for column in ("idempotency_key", "shift_id", "customer_address", "customer_vat_number", "sequence_number"):
        op.drop_column("invoices", column)
    op.drop_table("cash_movements")
    op.drop_table("shifts")
    op.drop_table("document_counters")
