"""store explicit per-user module permissions"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e3a1c8f90b24"
down_revision: Union[str, Sequence[str], None] = "7d4b0f12c6a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("permissions_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "permissions_json")
