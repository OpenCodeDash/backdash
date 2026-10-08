# backdash

Kanban + event stream backend for the **OpenCode Dash** frontend.

A small NestJS API over SQLite that stores boards, columns, tasks and tags, and
broadcasts every mutation as a server-sent event so clients stay live without
polling. Tasks can be claimed by an authenticated account (a user or an agent's
service account), optionally linked to an opencode session, and moved through
queues.

The matching frontend client is **react-backdash**.

## Stack

NestJS 12, MikroORM 7 + SQLite, `@nestjs/swagger` for the OpenAPI spec, SSE for
events, scrypt-hashed bearer tokens for auth.

## Project setup

```sh
npm install
npm run start:dev      # watch mode, http://127.0.0.1:3000
```

The database is created and migrated automatically on boot, so there is no
separate setup step. Swagger UI is at `/docs` and the raw spec at
`/openapi.json`.

## Docker (dash + backdash in one image)

`deploy/` builds a single image that runs **both** halves of OpenCode Dash
behind nginx as one origin:

| Path | Served by |
| --- | --- |
| `/` | dash (static SPA, history fallback) |
| `/api/` | backdash, with the `/api` prefix stripped (`/api/kanban` → `/kanban`) |
| `/opencode/` | the opencode server, proxied to `OPENCODE_UPSTREAM` |
| `/mcp` | an MCP server, at the **root** path — never `/api/mcp` |

dash talks to backdash and to opencode **same-origin**, so neither needs CORS.
`/opencode` and `/mcp` are each proxied to an upstream chosen at runtime
(`OPENCODE_UPSTREAM`, `MCP_UPSTREAM`); when unset, the path returns a clear `502`
instead of the SPA. These are root paths — never `/api/opencode` or `/api/mcp`.

The `.github/workflows/docker-publish.yml` workflow builds this image and
publishes it to the GitHub Container Registry on every push to `master` (and
`v*` tags), so you can pull it instead of building:

```sh
docker run --rm -p 8080:8080 -v ocd-data:/data \
  -e OPENCODE_UPSTREAM=http://<opencode-host>:4096 \
  ghcr.io/opencodedash/backdash:latest
```

The image bundles the dash repo at its default branch; run the workflow manually
(`workflow_dispatch`) to pick a different `dash-ref`.

To build it yourself, the context must contain both repos, so build from the
workspace root (the directory holding `dash/` and `backdash/`):

```sh
docker build -f backdash/deploy/Dockerfile -t ocd .
docker run --rm -p 8080:8080 -v ocd-data:/data ocd
```

or, equivalently:

```sh
cd backdash/deploy && docker compose up --build
```

Then: dash at `http://localhost:8080/`, API at `http://localhost:8080/api/`,
Swagger at `http://localhost:8080/api/docs`.

- The SQLite database lives at `DATABASE_PATH` (`/data/app.sqlite`); mount a
  volume at `/data` to persist it across restarts.
- `OPENCODE_UPSTREAM` is where nginx proxies `/opencode` (e.g.
  `http://gigabox:4096`, or `http://host.docker.internal:4096` for an opencode on
  the Docker host). It is a **runtime** env var — no rebuild — and must be
  reachable from the container. When unset, `/opencode` returns `502`.
- `VITE_BACKDASH_URL` (`/api`) and `VITE_OPENCODE_URL` (`/opencode`) are the
  relative **build args** Vite inlines into the dash bundle; the defaults are
  what you want, so you normally never set them.
- Point the kanban plugin/agents at the API including the prefix, e.g.
  `KANBAN_URL=http://<host>:8080/api` (unchanged token).
- Set `MCP_UPSTREAM` (e.g. `http://127.0.0.1:3010`) to expose an MCP server at
  `/mcp`; leave it unset to keep `/mcp` reserved.

## Configuration

A `.env` file in the working directory is loaded on startup, for both the app
and the MikroORM CLI (no extra dependency).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `BACKDASH_HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` to expose it |
| `BACKDASH_CORS_ORIGINS` | any | Comma-separated browser-origin allowlist for CORS |
| `DATABASE_PATH` | `./app.sqlite` | SQLite file |

Binding to loopback by default keeps the API off the LAN; exposing it is an
explicit opt-in. Auth is a bearer header, so CORS credentials are always off.

## API

Every route except `GET /` (health), `POST /auth/register`, `POST /auth/login`
and the Swagger docs requires a bearer token:

```http
Authorization: Bearer <token>
```

The **first** account to register becomes the admin; registration then closes.
Admins provision every later account:

- `POST /auth/users` — create a user (optionally an admin)
- `POST /auth/service` — create a service account for an agent/tool
- `GET /auth/service` / `DELETE /auth/service/:id` — list / revoke service accounts

Tokens are stored only as salted scrypt hashes: the plaintext token is returned
once and is not retrievable again. Logging in rotates the account's token.
Kanban events and task claims use the authenticated account name as the actor; a
service account claims tasks as its own name. `POST /auth/register` and
`POST /auth/login` are rate limited per client IP.

### Kanban

Boards, columns, tags and tasks live under `/kanban`:

- `POST /kanban` · `GET /kanban` · `GET /kanban/:id` · `PUT /kanban/:id` · `DELETE /kanban/:id`
- `POST /kanban/:boardId/columns` · `PUT|DELETE /kanban/:boardId/columns/:columnId` · `PUT /kanban/:boardId/columns/order`
- `POST /kanban/:boardId/columns/:columnId/tasks` · `PUT|DELETE .../tasks/:taskId`
- `POST /kanban/:boardId/tasks/:taskId/move`
- `POST /kanban/:boardId/columns/:columnId/tasks/:taskId/claim` · `.../release`
- `GET|POST /kanban/:boardId/tags` · `PUT|DELETE /kanban/:boardId/tags/:tagId`
- `GET /kanban/sessions/:sessionId/tasks` — resolve a session to the tasks linked to it

A new board is seeded with `Todo` / `In Progress` / `Done` columns. Columns may
be marked as queues; only queue tasks can be claimed. Claiming stores the actor
and optional opencode `sessionId`; releasing clears them.

### Events

Two SSE streams, each carrying an event as JSON with the event `seq` as its SSE
`id`:

- `GET /events` — all boards
- `GET /boards/:boardId/events` — one board

Event types: `board.created|updated|deleted`, `column.added|updated|deleted|reordered`,
`task.created|updated|claimed|moved|released|deleted`, `tag.added|updated|deleted`.
Resume from a known point with `?lastEventId=N` (or the `Last-Event-ID` header).
Named `ping` frames are keep-alives; a `resync` frame means history was pruned and
the client should refetch full state.

## Database & migrations

Backdash uses SQLite via MikroORM. The database file is controlled by
`DATABASE_PATH` and defaults to `./app.sqlite`.

Pending migrations are applied automatically when the app boots, so a brand-new
`DATABASE_PATH` is ready to use the moment the process starts — no separate
migration step is required. `migration:up` is idempotent: on an already-migrated
database it does nothing.

You can still drive migrations manually:

```sh
npm run build            # migrations reference compiled entities under dist/
npm run migration:create # create a new migration after changing entities
npm run migration:up     # apply pending migrations
npm run migration:down   # roll back the last migration
npm run migration:list   # list migrations and which have been applied
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Watch mode |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |
| `npm run build` | Compile with the Nest CLI |
| `npm run lint` | `oxlint` (type-aware) over `src/` and `test/` |
| `npm run format` | Prettier over `src/` and `test/` |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Vitest e2e tests |
| `npm run test:cov` | Coverage |

## Related

- `../dash` — web frontend that consumes this API.
- `../react-backdash` — React client for this API.
