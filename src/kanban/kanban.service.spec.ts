import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
	createTestContext,
	type TestContext,
} from "../../test/mikro-orm.test-helper.js";
import { KanbanModule } from "./kanban.module.js";
import { KanbanService } from "./kanban.service.js";

let ctx: TestContext;
let service: KanbanService;

beforeEach(async () => {
	ctx = await createTestContext([KanbanModule]);
	service = ctx.module.get(KanbanService);
});

afterEach(async () => {
	await ctx.module.close();
});

describe("KanbanService", () => {
	it("createBoard returns a board with the default columns", async () => {
		const board = await service.createBoard("Svc");
		expect(board.id).toMatch(/^[a-z]{6}$/);
		expect(board.columns.toArray()).toHaveLength(3);
	});

	it("all returns every board", async () => {
		await service.createBoard("One");
		await service.createBoard("Two");
		expect(await service.all()).toHaveLength(2);
	});

	it("getBoard returns the board with its columns", async () => {
		const created = await service.createBoard("Detail");
		const loaded = await service.getBoard(created.id);
		expect(loaded.id).toBe(created.id);
		expect(loaded.columns.toArray()).toHaveLength(3);
	});

	it("boardExists distinguishes present from missing boards", async () => {
		const created = await service.createBoard("Exists");
		expect(await service.boardExists(created.id)).toBe(true);
		expect(await service.boardExists("zzzzzz")).toBe(false);
	});

	it("reorderColumns reorders and returns the new order", async () => {
		const board = await service.createBoard("Reorder");
		const ids = board.columns.map((c) => c.id!);
		const result = await service.reorderColumns(board.id, [ids[2], ids[0], ids[1]]);
		expect(result.map((c) => c.name)).toEqual(["Done", "Todo", "In Progress"]);
	});

	it("reorderColumns throws 404 for a missing board", async () => {
		await expect(service.reorderColumns("zzzzzz", [1, 2, 3])).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("reorderColumns throws 400 for an invalid column list", async () => {
		const board = await service.createBoard("Bad");
		const ids = board.columns.map((c) => c.id!);
		await expect(
			service.reorderColumns(board.id, ids.slice(0, 2))
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
