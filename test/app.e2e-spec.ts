import { Test } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import http from "node:http";
import request from "supertest";
import { AppController } from "#/app.controller";
import { AppService } from "#/app.service";
import { KanbanModule } from "#/kanban/kanban.module";
import { EventsModule } from "#/events/events.module";
import { AuthModule } from "#/auth/auth.module";
import { AuthGuard } from "#/auth/auth.guard";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { EventEntity } from "#/events/entity/event.entity";
import { EventRepository } from "#/events/repository/event.repository";
import { EventType } from "#/events/enum/event-type.enum";
import { testConfig } from "./mikro-orm.test-helper.js";

const ACCOUNT_NAME = "e2e";
const ACCOUNT_PASSWORD = "e2e-password";

// Full-stack e2e: a real Nest application (routing, ValidationPipe, DI, the
// MikroORM request-context middleware, and an in-memory SQLite) driven over
// HTTP. Mirrors production by wiring the actual feature modules but swaps
// mikro-orm.config.ts for explicit entity class refs so Node never has to
// import .ts files. The app listens on an ephemeral port so the SSE test can
// use a raw HTTP client (supertest buffers the open-ended stream).
describe("backdash (e2e)", () => {
	let app: INestApplication;
	let orm: MikroORM;
	let port: number;
	let token = "";

	// Unauthenticated client used by the auth tests; every other test goes
	// through `api`, which attaches the bearer token obtained in beforeAll.
	const raw = () => request(`http://127.0.0.1:${port}`);

	const api = {
		get: (path: string) =>
			raw().get(path).set("Authorization", `Bearer ${token}`),
		post: (path: string) =>
			raw().post(path).set("Authorization", `Bearer ${token}`),
		put: (path: string) =>
			raw().put(path).set("Authorization", `Bearer ${token}`),
		delete: (path: string) =>
			raw().delete(path).set("Authorization", `Bearer ${token}`),
	};

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({
			imports: [
				MikroOrmModule.forRoot(testConfig()),
				AuthModule,
				KanbanModule,
				EventsModule,
			],
			controllers: [AppController],
			providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }],
		}).compile();

		orm = moduleFixture.get(MikroORM);
		await orm.schema.create();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({ transform: true, whitelist: true })
		);
		await app.listen(0);

		port = (app.getHttpServer().address() as { port: number }).port;

		// Register the shared identity that the bulk of the suite acts as.
		const registered = await raw()
			.post("/auth/register")
			.send({ name: ACCOUNT_NAME, password: ACCOUNT_PASSWORD })
			.expect(201);
		token = registered.body.token;
	});

	afterAll(async () => {
		await app.close();
	});

	// Create a board through the API and return the parsed detail response.
	async function createBoard(name: string) {
		const res = await api.post("/kanban").send({ name }).expect(201);
		return res.body;
	}

	it("GET / returns Hello World!", () =>
		api.get("/").expect(200).expect("Hello World!"));

	it("closes registration once the first (admin) account exists", () =>
		raw()
			.post("/auth/register")
			.send({ name: "late-signup", password: "password123" })
			.expect(403));

	it("admin provisions a user who can then log in", async () => {
		const created = await api
			.post("/auth/users")
			.send({ name: "reg-basic", password: "password123" })
			.expect(201);

		expect(created.body.account.name).toBe("reg-basic");
		expect(created.body.account.kind).toBe("user");
		expect(created.body.account.isAdmin).toBe(false);
		expect(created.body.token).toMatch(/^bdsk_/);

		const login = await raw()
			.post("/auth/login")
			.send({ name: "reg-basic", password: "password123" })
			.expect(200);
		expect(login.body.token).toMatch(/^bdsk_/);
	});

	it("POST /auth/users rejects a duplicate name with 409", async () => {
		await api
			.post("/auth/users")
			.send({ name: "user-dup", password: "password123" })
			.expect(201);
		await api
			.post("/auth/users")
			.send({ name: "user-dup", password: "password456" })
			.expect(409);
	});

	it("POST /auth/users rejects a short password with 400", () =>
		api
			.post("/auth/users")
			.send({ name: "user-short", password: "short" })
			.expect(400));

	it("POST /auth/login rejects a bad password with 401", async () => {
		await api
			.post("/auth/users")
			.send({ name: "log-bad", password: "password123" })
			.expect(201);

		await raw()
			.post("/auth/login")
			.send({ name: "log-bad", password: "wrong-password" })
			.expect(401);
	});

	it("GET /auth/me returns the authenticated admin account", async () => {
		const res = await api.get("/auth/me").expect(200);
		expect(res.body.name).toBe(ACCOUNT_NAME);
		expect(res.body.kind).toBe("user");
		expect(res.body.isAdmin).toBe(true);
	});

	it("a non-admin cannot provision users or service accounts", async () => {
		const user = await api
			.post("/auth/users")
			.send({ name: "pleb", password: "password123" })
			.expect(201);
		const asUser = (path: string) =>
			raw().post(path).set("Authorization", `Bearer ${user.body.token}`);

		await asUser("/auth/users")
			.send({ name: "nope", password: "password123" })
			.expect(403);
		await asUser("/auth/service")
			.send({ name: "nope-svc" })
			.expect(403);
	});

	it("protected routes reject a missing token with 401", () =>
		raw().get("/kanban").expect(401));

	it("protected routes reject an invalid token with 401", () =>
		raw().get("/kanban").set("Authorization", "Bearer not-a-token").expect(401));

	it("GET /events rejects a missing token with 401", () =>
		raw().get("/events").expect(401));

	it("POST /auth/service creates a service account", async () => {
		const res = await api
			.post("/auth/service")
			.send({ name: "svc-agent" })
			.expect(201);

		expect(res.body.account.kind).toBe("service");
		expect(res.body.token).toMatch(/^bdsk_/);
	});

	it("POST /auth/service rejects a duplicate name with 409", async () => {
		await api.post("/auth/service").send({ name: "svc-dup" }).expect(201);
		await api.post("/auth/service").send({ name: "svc-dup" }).expect(409);
	});

	it("GET /auth/service lists only service accounts", async () => {
		await api.post("/auth/service").send({ name: "svc-list" }).expect(201);

		const res = await api.get("/auth/service").expect(200);

		expect(res.body.map((account: { name: string }) => account.name)).toContain(
			"svc-list"
		);
		expect(
			res.body.every(
				(account: { kind: string }) => account.kind === "service"
			)
		).toBe(true);
	});

	it("a service account claims tasks as its own name", async () => {
		const svc = await api
			.post("/auth/service")
			.send({ name: "svc-worker" })
			.expect(201);
		const created = await createBoard("SvcClaim");
		const [todo] = created.columns;
		const task = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Work" })
			.expect(201);

		const claimed = await raw()
			.post(
				`/kanban/${created.id}/columns/${todo.id}/tasks/${task.body.id}/claim`
			)
			.set("Authorization", `Bearer ${svc.body.token}`)
			.send({})
			.expect(200);

		expect(claimed.body.claimedBy).toBe("svc-worker");
	});

	it("links a task to the claiming session and resolves it by session id", async () => {
		const created = await createBoard("SessionLink");
		const [todo] = created.columns;
		const task = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Linked" })
			.expect(201);

		// Claiming with a session id links the task to that session.
		const claimed = await api
			.post(
				`/kanban/${created.id}/columns/${todo.id}/tasks/${task.body.id}/claim`
			)
			.send({ sessionId: "ses_e2e" })
			.expect(200);
		expect(claimed.body.sessionId).toBe("ses_e2e");

		// The by-session lookup resolves it (and is not shadowed by /kanban/:id).
		const found = await api.get("/kanban/sessions/ses_e2e/tasks").expect(200);
		expect(found.body).toHaveLength(1);
		expect(found.body[0].boardId).toBe(created.id);
		expect(found.body[0].task.id).toBe(task.body.id);

		// Releasing clears the link.
		await api
			.post(
				`/kanban/${created.id}/columns/${todo.id}/tasks/${task.body.id}/release`
			)
			.expect(200);
		const after = await api.get("/kanban/sessions/ses_e2e/tasks").expect(200);
		expect(after.body).toEqual([]);
	});

	it("DELETE /auth/service/:id revokes the account and its token", async () => {
		const svc = await api
			.post("/auth/service")
			.send({ name: "svc-gone" })
			.expect(201);

		await api.delete(`/auth/service/${svc.body.account.id}`).expect(204);
		await raw()
			.get("/auth/me")
			.set("Authorization", `Bearer ${svc.body.token}`)
			.expect(401);
	});

	it("service accounts cannot manage other service accounts", async () => {
		const svc = await api
			.post("/auth/service")
			.send({ name: "svc-nopower" })
			.expect(201);

		await raw()
			.post("/auth/service")
			.set("Authorization", `Bearer ${svc.body.token}`)
			.send({ name: "svc-child" })
			.expect(403);
	});

	it("rate limits repeated login attempts with 429", async () => {
		let sawTooMany = false;
		for (let attempt = 0; attempt < 15; attempt += 1) {
			const res = await raw()
				.post("/auth/login")
				.send({ name: "ghost", password: "nope" });
			if (res.status === 429) {
				sawTooMany = true;
				break;
			}
		}
		expect(sawTooMany).toBe(true);
	});

	it("POST /kanban creates a board with the default columns", async () => {
		const board = await createBoard("Order");

		expect(board.id).toEqual(expect.any(String));
		expect(board.id).toHaveLength(6);
		expect(board.name).toBe("Order");

		expect(board.columns.map((c: { name: string }) => c.name)).toEqual([
			"Todo",
			"In Progress",
			"Done",
		]);
		expect(board.columns.map((c: { isQueue: boolean }) => c.isQueue)).toEqual([
			true,
			false,
			false,
		]);
		expect(board.columns.map((c: { position: number }) => c.position)).toEqual([
			0, 1, 2,
		]);
	});

	it("POST /kanban rejects an empty name with 400", () =>
		api.post("/kanban").send({ name: "" }).expect(400));

	it("POST /kanban rejects a missing name with 400", () =>
		api.post("/kanban").send({}).expect(400));

	it("GET /kanban lists every board", async () => {
		const created = await createBoard("Inbox");

		const res = await api.get("/kanban").expect(200);

		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: created.id, name: "Inbox" }),
			])
		);
	});

	it("GET /kanban/:id returns the board with its columns", async () => {
		const created = await createBoard("Detail");

		const res = await api.get(`/kanban/${created.id}`).expect(200);

		expect(res.body.id).toBe(created.id);
		expect(res.body.name).toBe("Detail");
		expect(res.body.columns).toHaveLength(3);
	});

	it("PUT /kanban/:id/columns/order reorders the columns", async () => {
		const created = await createBoard("Orderable");
		const ids = created.columns.map((c: { id: number }) => c.id);
		const reversed = [...ids].reverse();

		const res = await api
			.put(`/kanban/${created.id}/columns/order`)
			.send({ columnIds: reversed })
			.expect(200);

		expect(res.body.map((c: { name: string }) => c.name)).toEqual([
			"Done",
			"In Progress",
			"Todo",
		]);
		expect(res.body.map((c: { position: number }) => c.position)).toEqual([
			0, 1, 2,
		]);
	});

	it("PUT reorder returns 404 for a missing board", () =>
		api
			.put("/kanban/doesnotexist/columns/order")
			.send({ columnIds: [1, 2, 3] })
			.expect(404));

	it("PUT reorder returns 400 when columnIds is not a full permutation", async () => {
		const created = await createBoard("Broken");
		const [onlyOne] = created.columns.map((c: { id: number }) => c.id);

		await api
			.put(`/kanban/${created.id}/columns/order`)
			.send({ columnIds: [onlyOne] })
			.expect(400);
	});

	it("PUT /kanban/:id renames the board", async () => {
		const created = await createBoard("Before");

		const res = await api
			.put(`/kanban/${created.id}`)
			.send({ name: "After" })
			.expect(200);

		expect(res.body.name).toBe("After");
		expect(res.body.columns).toHaveLength(3);
	});

	it("PUT /kanban/:id returns 404 for a missing board", () =>
		api.put("/kanban/doesnotexist").send({ name: "X" }).expect(404));

	it("PUT /kanban/:id rejects an empty name with 400", async () => {
		const created = await createBoard("Keep");
		await api.put(`/kanban/${created.id}`).send({ name: "" }).expect(400);
	});

	it("DELETE /kanban/:id removes the board and its columns", async () => {
		const created = await createBoard("Gone");

		await api.delete(`/kanban/${created.id}`).expect(204);
		await api.get(`/kanban/${created.id}`).expect(404);
	});

	it("DELETE /kanban/:id returns 404 for a missing board", () =>
		api.delete("/kanban/doesnotexist").expect(404));

	it("POST /kanban/:id/columns appends a column at the end", async () => {
		const created = await createBoard("Cols");

		const res = await api
			.post(`/kanban/${created.id}/columns`)
			.send({ name: "Review", isQueue: true })
			.expect(201);

		expect(res.body.name).toBe("Review");
		expect(res.body.isQueue).toBe(true);
		expect(res.body.position).toBe(3);
	});

	it("POST /kanban/:id/columns returns 409 for a duplicate name", async () => {
		const created = await createBoard("DupCols");
		await api
			.post(`/kanban/${created.id}/columns`)
			.send({ name: "Todo" })
			.expect(409);
	});

	it("POST /kanban/:id/columns returns 404 for a missing board", () =>
		api.post("/kanban/doesnotexist/columns").send({ name: "X" }).expect(404));

	it("PUT /kanban/:boardId/columns/:columnId updates column fields", async () => {
		const created = await createBoard("UpdCols");
		const [todo] = created.columns;

		const res = await api
			.put(`/kanban/${created.id}/columns/${todo.id}`)
			.send({ name: "Ready", pushDescription: "push me" })
			.expect(200);

		expect(res.body.name).toBe("Ready");
		expect(res.body.pushDescription).toBe("push me");
	});

	it("PUT column returns 409 when renaming onto a duplicate name", async () => {
		const created = await createBoard("DupUpdCols");
		const [todo] = created.columns;

		await api
			.put(`/kanban/${created.id}/columns/${todo.id}`)
			.send({ name: "Done" })
			.expect(409);
	});

	it("PUT column returns 404 for a missing column", async () => {
		const created = await createBoard("MissUpdCols");
		await api
			.put(`/kanban/${created.id}/columns/9999`)
			.send({ name: "X" })
			.expect(404);
	});

	it("DELETE /kanban/:boardId/columns/:columnId removes the column", async () => {
		const created = await createBoard("DelCols");
		const [todo] = created.columns;

		await api
			.delete(`/kanban/${created.id}/columns/${todo.id}`)
			.expect(204);

		const res = await api.get(`/kanban/${created.id}`).expect(200);
		expect(res.body.columns).toHaveLength(2);
	});

	it("DELETE column returns 404 for a missing column", async () => {
		const created = await createBoard("MissDelCols");
		await api
			.delete(`/kanban/${created.id}/columns/9999`)
			.expect(404);
	});

	it("PUT column returns 400 for a non-integer column id", async () => {
		const created = await createBoard("BadIdCols");
		await api
			.put(`/kanban/${created.id}/columns/notanint`)
			.send({ name: "X" })
			.expect(400);
	});

	it("POST /kanban/:boardId/columns/:columnId/tasks creates a task", async () => {
		const created = await createBoard("TaskE2e");
		const [todo] = created.columns;

		const res = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "First task", description: "do it" })
			.expect(201);

		expect(res.body.name).toBe("First task");
		expect(res.body.description).toBe("do it");
		expect(res.body.position).toBe(0);
		expect(res.body.columnId).toBe(todo.id);
	});

	it("POST task rejects an empty name with 400", async () => {
		const created = await createBoard("TaskBadName");
		const [todo] = created.columns;
		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "" })
			.expect(400);
	});

	it("POST task returns 404 for a missing column", async () => {
		const created = await createBoard("TaskMissCol");
		await api
			.post(`/kanban/${created.id}/columns/9999/tasks`)
			.send({ name: "X" })
			.expect(404);
	});

	it("PUT /kanban/:boardId/columns/:columnId/tasks/:taskId updates the task", async () => {
		const created = await createBoard("TaskUpd");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Old" })
			.expect(201);

		const res = await api
			.put(`/kanban/${created.id}/columns/${todo.id}/tasks/${createdTask.body.id}`)
			.send({ name: "New", description: "updated" })
			.expect(200);

		expect(res.body.name).toBe("New");
		expect(res.body.description).toBe("updated");
	});

	it("PUT task returns 404 for a missing task", async () => {
		const created = await createBoard("TaskUpdMiss");
		const [todo] = created.columns;
		await api
			.put(`/kanban/${created.id}/columns/${todo.id}/tasks/9999`)
			.send({ name: "X" })
			.expect(404);
	});

	it("DELETE /kanban/:boardId/columns/:columnId/tasks/:taskId removes the task", async () => {
		const created = await createBoard("TaskDel");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Gone" })
			.expect(201);

		await api
			.delete(`/kanban/${created.id}/columns/${todo.id}/tasks/${createdTask.body.id}`)
			.expect(204);

		const res = await api.get(`/kanban/${created.id}`).expect(200);
		expect(res.body.columns[0].tasks).toHaveLength(0);
	});

	it("DELETE task returns 404 for a missing task", async () => {
		const created = await createBoard("TaskDelMiss");
		const [todo] = created.columns;
		await api
			.delete(`/kanban/${created.id}/columns/${todo.id}/tasks/9999`)
			.expect(404);
	});

	it("POST /kanban/:boardId/tasks/:taskId/move transfers the task between columns", async () => {
		const created = await createBoard("TaskMove");
		const [todo, inProgress] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Move me" })
			.expect(201);

		const res = await api
			.post(`/kanban/${created.id}/tasks/${createdTask.body.id}/move`)
			.send({ columnId: inProgress.id })
			.expect(200);

		expect(res.body.name).toBe("Move me");

		const board = await api.get(`/kanban/${created.id}`).expect(200);
		expect(board.body.columns[0].tasks).toHaveLength(0);
		expect(
			board.body.columns[1].tasks.map((t: { name: string }) => t.name)
		).toEqual(["Move me"]);
	});

	it("POST move reorders a task within a column", async () => {
		const created = await createBoard("TaskMvIn");
		const [todo] = created.columns;
		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "A" })
			.expect(201);
		const second = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "B" })
			.expect(201);

		await api
			.post(`/kanban/${created.id}/tasks/${second.body.id}/move`)
			.send({ columnId: todo.id, position: 0 })
			.expect(200);

		const board = await api.get(`/kanban/${created.id}`).expect(200);
		expect(
			board.body.columns[0].tasks.map((t: { name: string }) => t.name)
		).toEqual(["B", "A"]);
	});

	it("POST claim marks a queue task as the authenticated account", async () => {
		const created = await createBoard("TaskClaim");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Claim me" })
			.expect(201);

		const res = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${createdTask.body.id}/claim`)
			.send({})
			.expect(200);

		expect(res.body.claimedBy).toBe(ACCOUNT_NAME);
	});

	it("POST claim rejects a non-queue column with 400", async () => {
		const created = await createBoard("TaskClaimNoQ");
		const [, inProgress] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${inProgress.id}/tasks`)
			.send({ name: "No queue" })
			.expect(201);

		await api
			.post(`/kanban/${created.id}/columns/${inProgress.id}/tasks/${createdTask.body.id}/claim`)
			.send({})
			.expect(400);
	});

	it("POST claim rejects an already-claimed task with 409", async () => {
		const created = await createBoard("TaskClaimTwice");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Twice" })
			.expect(201);
		const id = createdTask.body.id;

		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${id}/claim`)
			.send({})
			.expect(200);
		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${id}/claim`)
			.send({})
			.expect(409);
	});

	it("POST release clears a claimed task", async () => {
		const created = await createBoard("TaskRelease");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "Release me" })
			.expect(201);
		const id = createdTask.body.id;

		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${id}/claim`)
			.send({})
			.expect(200);
		const res = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${id}/release`)
			.send({})
			.expect(200);

		expect(res.body.claimedBy).toBeNull();
	});

	it("POST release rejects an unclaimed task with 409", async () => {
		const created = await createBoard("TaskReleaseNone");
		const [todo] = created.columns;
		const createdTask = await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks`)
			.send({ name: "None" })
			.expect(201);

		await api
			.post(`/kanban/${created.id}/columns/${todo.id}/tasks/${createdTask.body.id}/release`)
			.send({})
			.expect(409);
	});

	it(
		"kanban mutations are emitted live over the SSE stream",
		async () => {
			const board = await createBoard("Streamed");
			const [latest] = await orm.em.find(EventEntity, {}, {
				orderBy: { seq: "desc" },
				limit: 1,
			});

			// Open the stream at the current tail, then mutate: the mutation's
			// events must arrive live (or via the replay catch-up, either way
			// the client sees them exactly once). The inner timer is shorter
			// than the test timeout so a failure reads as the descriptive
			// error rather than a bare vitest timeout.
			const body = await new Promise<string>((resolve, reject) => {
				const req = http.get(
					{
						host: "127.0.0.1",
						port,
						path: `/events?lastEventId=${latest!.seq}`,
						headers: { Authorization: `Bearer ${token}` },
					},
					(res) => {
						expect(res.statusCode).toBe(200);

						let acc = "";
						res.on("data", (chunk) => {
							acc += chunk.toString();
							if (acc.includes("column.added")) {
								req.destroy();
								resolve(acc);
							}
						});
						res.on("error", reject);
						res.on("end", () => resolve(acc));
						res.on("close", () => resolve(acc));

						setTimeout(async () => {
							try {
								await api
									.post(`/kanban/${board.id}/columns`)
									.send({ name: "Review" })
									.expect(201);
							} catch (error) {
								reject(error);
							}
						}, 300);
					}
				);
				setTimeout(() => {
					req.destroy();
					reject(new Error("timed out waiting for the live SSE event"));
				}, 10000);
			});

			expect(body).toContain("column.added");
			expect(body).toContain(`"boardId":"${board.id}"`);
		},
		15000
	);

	it("GET /events streams the replayed events as server-sent events", async () => {
		// Seed one event so the replay path (lastEventId=0) has something to
		// deliver; this proves an event actually flows over the wire, not just
		// that the route is wired up. Service-emitted events now precede it, so
		// wait for this specific seq rather than assuming it is the first.
		const em = orm.em.fork();
		const board = em.create(BoardEntity, { id: "e2esee", name: "SSE" });
		em.persist(board);
		await em.flush();
		const seeded = (em.getRepository(EventEntity) as EventRepository).append(
			board,
			EventType.BoardCreated,
			"system"
		);
		await em.flush();

		// Open-ended stream: collect frames until we see the replayed event,
		// then close the connection.
		const body = await new Promise<string>((resolve, reject) => {
			const req = http.get(
				{
					host: "127.0.0.1",
					port,
					path: "/events?lastEventId=0",
					headers: { Authorization: `Bearer ${token}` },
				},
				(res) => {
					expect(res.statusCode).toBe(200);
					expect(res.headers["content-type"]).toContain("text/event-stream");

					let acc = "";
					res.on("data", (chunk) => {
						acc += chunk.toString();
						if (acc.includes(`id: ${seeded.seq}`)) {
							req.destroy();
							resolve(acc);
						}
					});
					res.on("error", reject);
					res.on("end", () => resolve(acc));
					res.on("close", () => resolve(acc));
				}
			);
			setTimeout(() => {
				req.destroy();
				reject(new Error("timed out waiting for the SSE replay"));
			}, 5000);
		});

		expect(body).toContain("board.created");
		expect(body).toContain('"boardId":"e2esee"');
	});

	it("GET /boards/:id/events returns 404 for a missing board", () =>
		api.get("/boards/doesnotexist/events").expect(404));
});
