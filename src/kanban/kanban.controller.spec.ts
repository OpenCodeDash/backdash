import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Collection } from "@mikro-orm/core";
import { KanbanController } from "./kanban.controller.js";
import { KanbanService } from "./kanban.service.js";
import { BoardEntity } from "./entity/board.entity.js";
import { ColumnEntity } from "./entity/column.entity.js";

function makeColumn(id: number, name: string, position: number, isQueue: boolean): ColumnEntity {
	const column = new ColumnEntity();
	column.id = id;
	column.name = name;
	column.position = position;
	column.isQueue = isQueue;
	return column;
}

function makeBoard(id: string, name: string, columnNames: string[] = ["Todo"]): BoardEntity {
	const board = new BoardEntity();
	board.id = id;
	board.name = name;
	board.columns = new Collection(
		board,
		columnNames.map((n, i) => makeColumn(i + 1, n, i, i === 0))
	);
	return board;
}

interface ServiceMock {
	createBoard: ReturnType<typeof vi.fn>;
	all: ReturnType<typeof vi.fn>;
	getBoard: ReturnType<typeof vi.fn>;
	reorderColumns: ReturnType<typeof vi.fn>;
}

describe("KanbanController", () => {
	let controller: KanbanController;
	let service: ServiceMock;

	beforeEach(async () => {
		service = {
			createBoard: vi.fn(),
			all: vi.fn(),
			getBoard: vi.fn(),
			reorderColumns: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [KanbanController],
			providers: [{ provide: KanbanService, useValue: service }],
		}).compile();
		controller = module.get(KanbanController);
	});

	it("createBoard maps the service result to a BoardResponse", async () => {
		service.createBoard.mockResolvedValue(makeBoard("abcd12", "New"));
		const res = await controller.createBoard({ name: "New" });

		expect(service.createBoard).toHaveBeenCalledWith("New");
		expect(res.id).toBe("abcd12");
		expect(res.name).toBe("New");
		expect(res.columns).toHaveLength(1);
	});

	it("getAllBoards maps each board to a summary", async () => {
		service.all.mockResolvedValue([makeBoard("aa1", "A"), makeBoard("bb2", "B")]);
		const res = await controller.getAllBoards();
		expect(res).toEqual([
			{ id: "aa1", name: "A" },
			{ id: "bb2", name: "B" },
		]);
	});

	it("getBoard maps the service result to a BoardResponse", async () => {
		service.getBoard.mockResolvedValue(makeBoard("x1", "X"));
		const res = await controller.getBoard("x1");
		expect(res.id).toBe("x1");
		expect(res.columns).toHaveLength(1);
	});

	it("reorder maps columns to ColumnResponse in order", async () => {
		service.reorderColumns.mockResolvedValue([
			makeColumn(1, "Todo", 0, true),
			makeColumn(2, "Done", 1, false),
		]);
		const res = await controller.reorder("b1", { columnIds: [1, 2] });

		expect(service.reorderColumns).toHaveBeenCalledWith("b1", [1, 2]);
		expect(res).toEqual([
			{ id: 1, name: "Todo", position: 0, isQueue: true, pushDescription: null, pullDescription: null },
			{ id: 2, name: "Done", position: 1, isQueue: false, pushDescription: null, pullDescription: null },
		]);
	});

	it("propagates a 404 from the service", async () => {
		service.getBoard.mockRejectedValue(new NotFoundException("nope"));
		await expect(controller.getBoard("missing")).rejects.toBeInstanceOf(NotFoundException);
	});
});
