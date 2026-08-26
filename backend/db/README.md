# Kanban database

PostgreSQL 16, run locally in Docker.

## Schema

| table        | columns                                                        | notes |
|--------------|----------------------------------------------------------------|-------|
| `users`      | `id`, `name`, `email` (unique), `created_at`                   | |
| `cards`      | `id`, `title`, `description`, `stage`, `created_at`, `updated_at` | `stage` is enum `card_stage` = `todo` \| `in_progress` \| `completed` |
| `card_users` | `card_id` → cards, `user_id` → users, `assigned_at`            | PK `(card_id, user_id)` — join table so a card can have many users and a user many cards |

Both FKs in `card_users` are `ON DELETE CASCADE`.

## Start the database

```bash
docker run -d --name kanban-postgres \
  -e POSTGRES_USER=kanban -e POSTGRES_PASSWORD=kanban -e POSTGRES_DB=kanban \
  -p 5432:5432 -v kanban_pgdata:/var/lib/postgresql/data postgres:16
```

Connection string: `postgresql://kanban:kanban@localhost:5432/kanban`

## Apply schema / seed

```bash
docker exec -i kanban-postgres psql -v ON_ERROR_STOP=1 -U kanban -d kanban < schema.sql
docker exec -i kanban-postgres psql -v ON_ERROR_STOP=1 -U kanban -d kanban < seed.sql   # optional sample data
```

## Stop / start / remove

```bash
docker stop kanban-postgres      # stop (data kept in the kanban_pgdata volume)
docker start kanban-postgres     # start again
docker rm -f kanban-postgres && docker volume rm kanban_pgdata   # wipe everything
```
