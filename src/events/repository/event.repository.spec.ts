import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestOrm, type TestOrm } from "../../../test/mikro-orm.test-helper.js";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { BoardRepository } from "#/kanban/repository/board.repository";
import { EventEntity } from "../entity/event.entity.js";
import { EventRepository } from "./event.repository.js";
import { EventType } from "../enum/event-type.enum.js";

let ctx: TestOrm;
let boards: BoardRepository;
let events: EventRepository;

beforeEach(async () => {
	ctx = await initTestOrm();
	boards = ctx.em.getRepository(BoardEntity) as unknown as BoardRepository;
	events = ctx.em.getRepository(EventEntity) as unknown as EventRepository;
});

afterEach(async () => {
	await ctx.orm.close();
});

describe("EventRepository", () => {
	it("oldestSeq returns null when there are no events", async () => {
		await boards.newBoard("Empty");
		expect(await events.oldestSeq()).toBeNull();
	});

	it("append persists events with autoincrementing seq", async () => {
		const board = await boards.newBoard("Events");
		const a = events.append(board, EventType.BoardCreated, "system", {});
		await ctx.em.flush();
		const b = events.append(board, EventType.TaskCreated, "agent-1", {});
		await ctx.em.flush();

		expect(typeof a.seq).toBe("number");
		expect(b.seq).toBe(a.seq! + 1);
		expect(await events.oldestSeq()).toBe(a.seq);
	});

	it("findAfter returns events newer than the cursor, ascending", async () => {
		const board = await boards.newBoard("Cursor");
		for (let i = 0; i < 3; i++) {
			events.append(board, EventType.TaskCreated, "agent", { i });
			await ctx.em.flush();
		}

		const all = await events.findAfter(-1);
		const afterFirst = await events.findAfter(all[0].seq!);
		expect(all.map((e) => e.seq)).toEqual(all.map((e) => e.seq!).sort((a, b) => a - b));
		expect(afterFirst.map((e) => e.seq)).toEqual(all.slice(1).map((e) => e.seq));
	});

	it("findAfter filters to one board when boardId is given", async () => {
		const boardA = await boards.newBoard("A");
		const boardB = await boards.newBoard("B");
		events.append(boardA, EventType.TaskCreated, "agent", {});
		events.append(boardB, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();

		const aOnly = await events.findAfter(-1, boardA.id);
		expect(aOnly).toHaveLength(1);
		expect(aOnly[0].board.id).toBe(boardA.id);
	});

	it("pruneOlderThan deletes only events older than the cutoff", async () => {
		const board = await boards.newBoard("Prune");
		const e = events.append(board, EventType.TaskCreated, "agent", {});
		await ctx.em.flush();
		const created = e.createdAt!;

		expect(await events.pruneOlderThan(new Date(created.getTime() - 1000))).toBe(0);
		expect(await events.pruneOlderThan(new Date(created.getTime() + 1000))).toBe(1);
	});
});
