"""Database connection pool for the Kanban API."""

import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://kanban:kanban@localhost:5432/kanban",
)

# Opened on FastAPI startup, closed on shutdown (see main.py lifespan).
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row})
