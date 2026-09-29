import { Test } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import http from "node:http";
import request from "supertest";
import { AppController } from "#/app.controller";
import { AppService } from "#/app.service";
import { KanbanModule } from "#/kanban/kanban.module";
import { EventsModule } from "#/events/events.module";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { EventEntity } from "#/events/entity/event.entity";
import { EventRepository } from "#/events/repository/event.repository";
import { EventType } from "#/events/enum/event-type.enum";
import { testConfig } from "./mikro-orm.test-helper.js";

// Full-stack e2e: a real Nest application (routing, ValidationPipe, DI, the
// MikroORM request-context middleware, and an in-memory SQLite) driven over
// HTTP. Mirrors production by wiring the actual feature modules but swaps
// mikro-orm.config.ts for explicit entity class refs so Node never has to
// import .ts files. The app listens on an ephemeral port so the SSE test can
// use a raw HTTP client (supertest buffers the open-ended stream).
describe("backdash (e2e)", () => {
	let app: INestApplication;
	let orm: MikroORM;
	let api: ReturnType<typeof request>;
	let port: number;

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({
			imports: [
				MikroOrmModule.forRoot(testConfig()),
				KanbanModule,
				EventsModule,
			],
			controllers: [AppController],
			providers: [AppService],
		}).compile();

		orm = moduleFixture.get(MikroORM);
		await orm.schema.create();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({ transform: true, whitelist: true })
		);
		await app.listen(0);

		port = (app.getHttpServer().address() as { port: number }).port;
		api = request(`http://127.0.0.1:${port}`);
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

	it("GET /events streams the replayed events as server-sent events", async () => {
		// Seed one event so the replay path (lastEventId=0) has something to
		// deliver; this proves an event actually flows over the wire, not just
		// that the route is wired up.
		const em = orm.em.fork();
		const board = em.create(BoardEntity, { id: "e2esee", name: "SSE" });
		em.persist(board);
		await em.flush();
		(em.getRepository(EventEntity) as EventRepository).append(
			board,
			EventType.BoardCreated,
			"system"
		);
		await em.flush();

		// Open-ended stream: collect frames until we see the replayed event,
		// then close the connection.
		const body = await new Promise<string>((resolve, reject) => {
			const req = http.get(
				{ host: "127.0.0.1", port, path: "/events?lastEventId=0" },
				(res) => {
					expect(res.statusCode).toBe(200);
					expect(res.headers["content-type"]).toContain("text/event-stream");

					let acc = "";
					res.on("data", (chunk) => {
						acc += chunk.toString();
						if (acc.includes("id: 1")) {
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
