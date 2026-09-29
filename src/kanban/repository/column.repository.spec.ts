import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestOrm, type TestOrm } from "../../../test/mikro-orm.test-helper.js";
import { BoardEntity } from "../entity/board.entity.js";
import { ColumnEntity } from "../entity/column.entity.js";
import { BoardRepository } from "./board.repository.js";
import { ColumnRepository } from "./column.repository.js";

let ctx: TestOrm;
let boards: BoardRepository;
let columns: ColumnRepository;

beforeEach(async () => {
	ctx = await initTestOrm();
	boards = ctx.em.getRepository(BoardEntity) as unknown as BoardRepository;
	columns = ctx.em.getRepository(ColumnEntity) as unknown as ColumnRepository;
});

afterEach(async () => {
	await ctx.orm.close();
});

describe("ColumnRepository", () => {
	it("findByBoard returns columns in position order", async () => {
		const board = await boards.newBoard("Order");
		const found = await columns.findByBoard(board.id);
		expect(found.map((c) => c.name)).toEqual(["Todo", "In Progress", "Done"]);
	});

	it("findQueues returns only the queue columns", async () => {
		const board = await boards.newBoard("Queues");
		const queues = await columns.findQueues(board.id);
		expect(queues.map((c) => c.name)).toEqual(["Todo"]);
	});

	it("addColumn appends at the next position", async () => {
		const board = await boards.newBoard("Append");
		const added = await columns.addColumn(board, "Review", true);

		expect(added.position).toBe(3);
		expect(added.isQueue).toBe(true);
		expect(await columns.findByBoard(board.id)).toHaveLength(4);
	});

	it("reorder reassigns positions in the given order", async () => {
		const board = await boards.newBoard("Reorder");
		const [todo, inProgress, done] = (
			await columns.findByBoard(board.id)
		).map((c) => c.id);

		const result = await columns.reorder(board.id, [done!, todo!, inProgress!]);
		expect(result.map((c) => c.name)).toEqual(["Done", "Todo", "In Progress"]);
	});

	it("reorder rejects an incomplete or duplicated list", async () => {
		const board = await boards.newBoard("Bad");
		const ids = (await columns.findByBoard(board.id)).map((c) => c.id!);

		await expect(columns.reorder(board.id, ids.slice(0, 2))).rejects.toThrow(
			/exactly once/
		);
		await expect(columns.reorder(board.id, [ids[0], ids[0]])).rejects.toThrow(
			/exactly once/
		);
	});
});
