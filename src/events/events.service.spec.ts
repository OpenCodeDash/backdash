import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { MessageEvent } from "@nestjs/common";
import {
	createTestContext,
	type TestContext,
} from "../../test/mikro-orm.test-helper.js";
import { EventsModule } from "./events.module.js";
import { EventsService } from "./events.service.js";
import { EventResponse } from "./response/event.response.js";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { BoardRepository } from "#/kanban/repository/board.repository";
import { EventEntity } from "./entity/event.entity.js";
import { EventRepository } from "./repository/event.repository.js";
import { EventType } from "./enum/event-type.enum.js";

const HEARTBEAT_MS = 20_000;

async function waitFor(condition: () => boolean, timeout = 2_000): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error("waitFor timed out");
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

let ctx: TestContext;
let service: EventsService;
let boards: BoardRepository;
let events: EventRepository;

beforeEach(async () => {
	ctx = await createTestContext([EventsModule]);
	service = ctx.module.get(EventsService);
	boards = ctx.em.getRepository(BoardEntity) as unknown as BoardRepository;
	events = ctx.em.getRepository(EventEntity) as unknown as EventRepository;
});

afterEach(async () => {
	vi.useRealTimers();
	await ctx.module.close();
});

describe("EventsService", () => {
	it("publish pushes each event to live subscribers", async () => {
		const board = await boards.newBoard("Pub");
		const received: MessageEvent[] = [];
		const sub = service.stream().subscribe((m) => received.push(m));

		const event = events.append(board, EventType.BoardCreated, "system", {});
		await ctx.em.flush();
		service.publish([EventResponse.from(event)]);
		sub.unsubscribe();

		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(String(event.seq));
	});

	it("delivers live events to a global stream", async () => {
		const board = await boards.newBoard("Live");
		const received: MessageEvent[] = [];
		const sub = service.stream().subscribe((m) => received.push(m));

		const event = events.append(board, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();
		service.publish([EventResponse.from(event)]);
		sub.unsubscribe();

		expect(received).toHaveLength(1);
		expect(received[0].data).toMatchObject({ boardId: board.id });
	});

	it("filters the live stream to a single board", async () => {
		const boardA = await boards.newBoard("A");
		const boardB = await boards.newBoard("B");
		const received: MessageEvent[] = [];
		const sub = service.stream(boardA.id).subscribe((m) => received.push(m));

		const evA = events.append(boardA, EventType.TaskCreated, "agent", {});
		const evB = events.append(boardB, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();
		service.publish([EventResponse.from(evA), EventResponse.from(evB)]);
		sub.unsubscribe();

		expect(received).toHaveLength(1);
		expect(received[0].data).toMatchObject({ boardId: boardA.id });
	});

	it("replays the backlog after lastEventId on connect", async () => {
		const board = await boards.newBoard("Replay");
		const e1 = events.append(board, EventType.TaskCreated, "agent", { n: 1 });
		const e2 = events.append(board, EventType.TaskCreated, "agent", { n: 2 });
		const e3 = events.append(board, EventType.TaskCreated, "agent", { n: 3 });
		await ctx.em.flush();

		const received: MessageEvent[] = [];
		const sub = service.stream(board.id, e1.seq!).subscribe((m) => received.push(m));
		await waitFor(() => received.length === 2);
		sub.unsubscribe();

		expect(received.map((m) => (m.data as EventResponse).seq)).toEqual([e2.seq, e3.seq]);
	});

	it("sends a resync when lastEventId predates the oldest stored event", async () => {
		const board = await boards.newBoard("Resync");
		const e1 = events.append(board, EventType.TaskCreated, "agent", {});
		const e2 = events.append(board, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();
		await events.pruneOlderThan(new Date(e2.createdAt!.getTime() + 1000));
		events.append(board, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();

		const received: MessageEvent[] = [];
		const sub = service.stream(board.id, e1.seq!).subscribe((m) => received.push(m));
		await waitFor(() => received.some((m) => m.type === "resync"));
		sub.unsubscribe();

		expect(received.some((m) => m.type === "resync")).toBe(true);
	});

	it("emits a ping heartbeat on an idle stream", async () => {
		vi.useFakeTimers();
		const received: MessageEvent[] = [];
		const sub = service.stream().subscribe((m) => received.push(m));

		await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
		sub.unsubscribe();

		expect(received.some((m) => m.type === "ping")).toBe(true);
	});
});
