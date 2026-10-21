"""Gapless document numbering.

The counter row is advanced with a single UPDATE inside the caller's transaction.
In SQLite (and PostgreSQL) that UPDATE takes the write lock, so concurrent sales are
serialised, and if the sale later fails the caller's ROLLBACK also rolls the counter
back: a number is only consumed by an invoice that is actually committed.
"""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import DocumentCounter

INVOICE_SERIES = "invoice"
SHIFT_SERIES = "shift"
INVOICE_PREFIX = "INV-"


def _create_counter_if_missing(db: Session, company_id: str, series: str) -> None:
    # INSERT .. ON CONFLICT DO NOTHING: no savepoints/exceptions, safe if two requests race here.
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(
        insert(DocumentCounter)
        .values(company_id=company_id, series=series, next_value=1)
        .on_conflict_do_nothing()
    )


def allocate_number(db: Session, company_id: str, series: str) -> int:
    """Return the next number of `series` (1, 2, 3 ...) inside the current transaction."""
    where = (DocumentCounter.company_id == company_id, DocumentCounter.series == series)
    for _ in range(3):
        result = db.execute(
            update(DocumentCounter).where(*where)
            .values(next_value=DocumentCounter.next_value + 1)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount == 1:
            new_value = db.execute(select(DocumentCounter.next_value).where(*where)).scalar_one()
            return int(new_value) - 1
        _create_counter_if_missing(db, company_id, series)
    raise RuntimeError("Could not allocate a document number")


def format_invoice_number(sequence: int) -> str:
    return f"{INVOICE_PREFIX}{sequence:08d}"
