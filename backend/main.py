"""FastAPI service for the Kanban board.

Exposes a health endpoint (used by the front end connection dot) and a
CRUD API over the `cards` table, including per-card user assignments.

Run:  uvicorn main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal, Optional

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import pool

Stage = Literal["todo", "in_progress", "completed"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    pool.open()
    try:
        yield
    finally:
        pool.close()


app = FastAPI(title="Kanban API", lifespan=lifespan)

# Vite dev server origins (both hostname spellings).
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",  # `vite preview`
    "http://127.0.0.1:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class CardCreate(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    stage: Stage = "todo"
    assignee_ids: list[int] = Field(default_factory=list)


class CardUpdate(BaseModel):
    # All optional: only the provided fields are changed (partial update).
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    stage: Optional[Stage] = None
    assignee_ids: Optional[list[int]] = None


class Card(BaseModel):
    id: int
    title: str
    description: Optional[str]
    stage: Stage
    assignee_ids: list[int]
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
_SELECT_CARD = """
    SELECT c.id, c.title, c.description, c.stage, c.created_at, c.updated_at,
           COALESCE(
               array_agg(cu.user_id ORDER BY cu.user_id)
               FILTER (WHERE cu.user_id IS NOT NULL),
               '{}'
           ) AS assignee_ids
    FROM cards c
    LEFT JOIN card_users cu ON cu.card_id = c.id
"""


def _fetch_card(cur, card_id: int) -> Optional[dict]:
    cur.execute(_SELECT_CARD + " WHERE c.id = %s GROUP BY c.id", (card_id,))
    return cur.fetchone()


def _set_assignees(cur, card_id: int, user_ids: list[int]) -> None:
    """Replace the card's assignees with the given set of user ids."""
    cur.execute("DELETE FROM card_users WHERE card_id = %s", (card_id,))
    for uid in dict.fromkeys(user_ids):  # dedupe, keep order
        cur.execute(
            "INSERT INTO card_users (card_id, user_id) VALUES (%s, %s)",
            (card_id, uid),
        )


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return {"message": "Hello World"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/cards", response_model=list[Card])
def list_cards(stage: Optional[Stage] = None):
    with pool.connection() as conn, conn.cursor() as cur:
        if stage:
            cur.execute(
                _SELECT_CARD + " WHERE c.stage = %s GROUP BY c.id ORDER BY c.id",
                (stage,),
            )
        else:
            cur.execute(_SELECT_CARD + " GROUP BY c.id ORDER BY c.id")
        return cur.fetchall()


@app.get("/api/cards/{card_id}", response_model=Card)
def get_card(card_id: int):
    with pool.connection() as conn, conn.cursor() as cur:
        card = _fetch_card(cur, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@app.post("/api/cards", response_model=Card, status_code=201)
def create_card(payload: CardCreate):
    with pool.connection() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """INSERT INTO cards (title, description, stage)
                   VALUES (%s, %s, %s) RETURNING id""",
                (payload.title, payload.description, payload.stage),
            )
            card_id = cur.fetchone()["id"]
            if payload.assignee_ids:
                _set_assignees(cur, card_id, payload.assignee_ids)
            card = _fetch_card(cur, card_id)
        except psycopg.errors.ForeignKeyViolation:
            raise HTTPException(status_code=400, detail="One or more assignee_ids do not exist")
    return card


@app.patch("/api/cards/{card_id}", response_model=Card)
def update_card(card_id: int, payload: CardUpdate):
    fields = payload.model_dump(exclude_unset=True)
    with pool.connection() as conn, conn.cursor() as cur:
        if _fetch_card(cur, card_id) is None:
            raise HTTPException(status_code=404, detail="Card not found")

        # Column updates (everything except assignee_ids).
        columns = {k: v for k, v in fields.items() if k != "assignee_ids"}
        if columns:
            set_sql = ", ".join(f"{col} = %s" for col in columns)
            cur.execute(
                f"UPDATE cards SET {set_sql}, updated_at = now() WHERE id = %s",
                (*columns.values(), card_id),
            )

        # Assignees replaced only when the key is present in the request body.
        if "assignee_ids" in fields:
            try:
                _set_assignees(cur, card_id, fields["assignee_ids"] or [])
            except psycopg.errors.ForeignKeyViolation:
                raise HTTPException(status_code=400, detail="One or more assignee_ids do not exist")

        card = _fetch_card(cur, card_id)
    return card


@app.delete("/api/cards/{card_id}", status_code=204)
def delete_card(card_id: int):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM cards WHERE id = %s", (card_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Card not found")
    return None
