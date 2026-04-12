# Database Migrations (Alembic)

VeriPay uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations. Migrations run automatically on app startup, so deploying new code with new migrations "just works."

## How it works

- All models are defined in `backend/models/`
- Alembic config: `backend/alembic.ini` + `backend/alembic/env.py`
- Migration scripts: `backend/alembic/versions/`
- On startup, `main.py` runs `alembic upgrade head` to apply any pending migrations

## Common commands

Run these from the `backend/` directory:

```bash
# Create a new migration after changing models
python -m alembic revision --autogenerate -m "describe_your_change"

# Apply all pending migrations
python -m alembic upgrade head

# Rollback the last migration
python -m alembic downgrade -1

# See current migration state
python -m alembic current

# See migration history
python -m alembic history --verbose
```

## Creating a migration

1. Edit your model in `backend/models/`
2. Run `python -m alembic revision --autogenerate -m "add_foo_column"`
3. **Review the generated file** in `alembic/versions/` — autogenerate is not perfect:
   - It may try to drop columns that exist in DB but not in models (remove those operations)
   - It may detect type changes between generic `JSON` and PostgreSQL `JSONB` (ignore those)
   - It may flag nullable differences — only keep changes you intentionally made
4. Test: `python -m alembic upgrade head`
5. Commit the migration file along with your model changes

## Important notes

- Never hardcode database credentials in `alembic.ini` — the URL is loaded from `.env` in `env.py`
- The `alembic_version` table in your database tracks which migration is applied
- Migrations auto-run on app startup — no manual step needed for deploys
- If you need to start fresh: `python -m alembic stamp head` marks the current DB state as up-to-date without running any migrations
