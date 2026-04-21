import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# ---------------------------------------------------------------------------
# Ensure the backend directory is on sys.path so model imports work
# ---------------------------------------------------------------------------
backend_dir = str(Path(__file__).resolve().parents[1])
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Load .env from the backend folder (same pattern as conn_db.py)
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(backend_dir) / ".env")

# ---------------------------------------------------------------------------
# Import all models so Alembic sees every table and column
# ---------------------------------------------------------------------------
from conn_db import Base, DATABASE_URL  # noqa: E402

from models.user import User  # noqa: F401, E402
from models.vendor import Vendor  # noqa: F401, E402
from models.invoice import Invoice  # noqa: F401, E402
from models.analysis_result import AnalysisResult  # noqa: F401, E402
from models.vendor_bank_binding import VendorBankBinding  # noqa: F401, E402
from models.audit_log import AuditLog  # noqa: F401, E402
from models.review import InvoiceReview  # noqa: F401, E402

# ---------------------------------------------------------------------------
# Alembic Config
# ---------------------------------------------------------------------------
config = context.config

# Override sqlalchemy.url from the environment (never hardcoded in ini)
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with a live database connection)."""

    # Build connect_args matching conn_db.py
    db_sslmode = os.getenv("DB_SSLMODE", "require")
    connect_args = {}
    if db_sslmode:
        connect_args["sslmode"] = db_sslmode

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
