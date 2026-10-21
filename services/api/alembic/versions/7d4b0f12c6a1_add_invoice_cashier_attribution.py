"""attribute new sales invoices to the authenticated cashier"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
revision: str = "7d4b0f12c6a1"
down_revision: Union[str, Sequence[str], None] = "4b7e21c60a93"
branch_labels = None
depends_on = None
def upgrade() -> None:
    op.add_column("invoices", sa.Column("created_by", sa.String(length=36), nullable=True))
    op.create_index("ix_invoices_created_by", "invoices", ["created_by"], unique=False)
def downgrade() -> None:
    op.drop_index("ix_invoices_created_by", table_name="invoices")
    op.drop_column("invoices", "created_by")
