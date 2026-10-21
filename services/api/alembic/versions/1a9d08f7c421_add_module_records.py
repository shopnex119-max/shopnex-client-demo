"""add durable records for restaurant, CRM and HR modules

Revision ID: 1a9d08f7c421
Revises: 55fdf47b2cff
Create Date: 2026-10-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "1a9d08f7c421"
down_revision: Union[str, Sequence[str], None] = "55fdf47b2cff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "module_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("company_id", sa.String(length=36), nullable=False),
        sa.Column("module", sa.String(length=32), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_module_records_company_id"), "module_records", ["company_id"], unique=False)
    op.create_index(op.f("ix_module_records_module"), "module_records", ["module"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_module_records_module"), table_name="module_records")
    op.drop_index(op.f("ix_module_records_company_id"), table_name="module_records")
    op.drop_table("module_records")
