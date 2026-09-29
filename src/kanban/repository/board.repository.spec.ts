import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestOrm, type TestOrm } from "../../../test/mikro-orm.test-helper.js";
import { BoardEntity } from "../entity/board.entity.js";
import { BoardRepository, DEFAULT_COLUMNS } from "./board.repository.js";

let ctx: TestOrm;
let repo: BoardRepository;

beforeEach(async () => {
	ctx = await initTestOrm();
	repo = ctx.em.getRepository(BoardEntity) as unknown as BoardRepository;
});

afterEach(async () => {
	await ctx.orm.close();
});

describe("BoardRepository", () => {
	it("newBoard creates a board with the default columns in order", async () => {
		const board = await repo.newBoard("Team A");

		expect(board.id).toMatch(/^[a-z]{6}$/);
		expect(board.name).toBe("Team A");
		expect(board.columns.map((c) => c.name)).toEqual(
			DEFAULT_COLUMNS.map((c) => c.name)
		);
		expect(board.columns.map((c) => c.position)).toEqual([0, 1, 2]);
		expect(board.columns.toArray()).toHaveLength(3);
	});

	it("assigns a unique id per board", async () => {
		const a = await repo.newBoard("A");
		const b = await repo.newBoard("B");
		expect(a.id).not.toBe(b.id);
	});

	it("findWithColumns returns the board with populated columns", async () => {
		const created = await repo.newBoard("Lookups");
		const loaded = await repo.findWithColumns(created.id);

		expect(loaded.id).toBe(created.id);
		expect(loaded.columns.isInitialized()).toBe(true);
		expect(loaded.columns.toArray()).toHaveLength(3);
	});

	it("listWithColumns returns every board sorted by name", async () => {
		await repo.newBoard("Zebra");
		await repo.newBoard("Alpha");

		const boards = await repo.listWithColumns();
		const names = boards.map((b) => b.name);
		expect(names).toEqual([...names].sort());
	});
});
