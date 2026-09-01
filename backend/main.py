"""FastAPI service for the Kanban board.

Exposes a health endpoint (used by the front end connection dot) and a
CRUD API over the `cards` table, including per-card user assignments.

Run:  uvicorn main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal, Optional
import os

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import pool

Stage = Literal["todo", "in_progress", "completed"]

GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "245835837222-qa1htil1kpgaiaq0u0ep9ts5vpls6hqa.apps.googleusercontent.com",
)


def ensure_auth_schema() -> None:
    """Add Google sign-in columns for existing databases."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub)")
        cur.execute("ALTER TABLE cards ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users (id) ON DELETE CASCADE")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards (user_id)")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    pool.open()
    ensure_auth_schema()
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
    user_id: Optional[int] = None
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
    SELECT c.id, c.user_id, c.title, c.description, c.stage, c.created_at, c.updated_at,
           COALESCE(
               array_agg(cu.user_id ORDER BY cu.user_id)
               FILTER (WHERE cu.user_id IS NOT NULL),
               '{}'
           ) AS assignee_ids
    FROM cards c
    LEFT JOIN card_users cu ON cu.card_id = c.id
"""


def _fetch_card(cur, card_id: int, user_id: int) -> Optional[dict]:
    cur.execute(_SELECT_CARD + " WHERE c.id = %s AND c.user_id = %s GROUP BY c.id", (card_id, user_id))
    return cur.fetchone()


def _set_assignees(cur, card_id: int, user_ids: list[int]) -> None:
    """Replace the card's assignees with the given set of user ids."""
    cur.execute("DELETE FROM card_users WHERE card_id = %s", (card_id,))
    for uid in dict.fromkeys(user_ids):  # dedupe, keep order
        cur.execute(
            "INSERT INTO card_users (card_id, user_id) VALUES (%s, %s)",
            (card_id, uid),
        )


def _upsert_google_user(cur, payload: dict) -> dict:
    google_sub = payload["sub"]
    email = payload["email"]
    name = payload.get("name") or email
    picture = payload.get("picture")

    cur.execute(
        """
        UPDATE users
        SET email = %s, name = %s, picture = %s, last_seen_at = now()
        WHERE google_sub = %s
        RETURNING id, google_sub, email, name, picture
        """,
        (email, name, picture, google_sub),
    )
    user = cur.fetchone()
    if user:
        return user

    cur.execute(
        """
        INSERT INTO users (google_sub, email, name, picture)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (email) DO UPDATE
          SET google_sub = COALESCE(users.google_sub, EXCLUDED.google_sub),
              name = EXCLUDED.name,
              picture = EXCLUDED.picture,
              last_seen_at = now()
        RETURNING id, google_sub, email, name, picture
        """,
        (google_sub, email, name, picture),
    )
    return cur.fetchone()


def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    if not payload.get("sub") or not payload.get("email"):
        raise HTTPException(status_code=401, detail="Invalid Google token")

    with pool.connection() as conn, conn.cursor() as cur:
        return _upsert_google_user(cur, payload)


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return {"message": "Hello World"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user


@app.get("/api/cards", response_model=list[Card])
def list_cards(stage: Optional[Stage] = None, user=Depends(current_user)):
    with pool.connection() as conn, conn.cursor() as cur:
        if stage:
            cur.execute(
                _SELECT_CARD + " WHERE c.user_id = %s AND c.stage = %s GROUP BY c.id ORDER BY c.id",
                (user["id"], stage),
            )
        else:
            cur.execute(_SELECT_CARD + " WHERE c.user_id = %s GROUP BY c.id ORDER BY c.id", (user["id"],))
        return cur.fetchall()


@app.get("/api/cards/{card_id}", response_model=Card)
def get_card(card_id: int, user=Depends(current_user)):
    with pool.connection() as conn, conn.cursor() as cur:
        card = _fetch_card(cur, card_id, user["id"])
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@app.post("/api/cards", response_model=Card, status_code=201)
def create_card(payload: CardCreate, user=Depends(current_user)):
    with pool.connection() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """INSERT INTO cards (user_id, title, description, stage)
                   VALUES (%s, %s, %s, %s) RETURNING id""",
                (user["id"], payload.title, payload.description, payload.stage),
            )
            card_id = cur.fetchone()["id"]
            if payload.assignee_ids:
                _set_assignees(cur, card_id, payload.assignee_ids)
            card = _fetch_card(cur, card_id, user["id"])
        except psycopg.errors.ForeignKeyViolation:
            raise HTTPException(status_code=400, detail="One or more assignee_ids do not exist")
    return card


@app.patch("/api/cards/{card_id}", response_model=Card)
def update_card(card_id: int, payload: CardUpdate, user=Depends(current_user)):
    fields = payload.model_dump(exclude_unset=True)
    with pool.connection() as conn, conn.cursor() as cur:
        if _fetch_card(cur, card_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Card not found")

        # Column updates (everything except assignee_ids).
        columns = {k: v for k, v in fields.items() if k != "assignee_ids"}
        if columns:
            set_sql = ", ".join(f"{col} = %s" for col in columns)
            cur.execute(
                f"UPDATE cards SET {set_sql}, updated_at = now() WHERE id = %s AND user_id = %s",
                (*columns.values(), card_id, user["id"]),
            )

        # Assignees replaced only when the key is present in the request body.
        if "assignee_ids" in fields:
            try:
                _set_assignees(cur, card_id, fields["assignee_ids"] or [])
            except psycopg.errors.ForeignKeyViolation:
                raise HTTPException(status_code=400, detail="One or more assignee_ids do not exist")

        card = _fetch_card(cur, card_id, user["id"])
    return card


@app.delete("/api/cards/{card_id}", status_code=204)
def delete_card(card_id: int, user=Depends(current_user)):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM cards WHERE id = %s AND user_id = %s", (card_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Card not found")
    return None
