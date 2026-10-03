import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Collection } from "@mikro-orm/core";
import { KanbanController } from "./kanban.controller.js";
import { KanbanService } from "./kanban.service.js";
import { BoardEntity } from "./entity/board.entity.js";
import { ColumnEntity } from "./entity/column.entity.js";
import { TaskEntity } from "./entity/task.entity.js";
import { TagEntity } from "./entity/tag.entity.js";
import { AccountKind } from "../auth/enum/account-kind.enum.js";
import type { AuthenticatedAccount } from "../auth/auth.types.js";

// Stand-in for the account the AuthGuard attaches to every request.
const account: AuthenticatedAccount = {
	id: "acct01",
	name: "tester",
	kind: AccountKind.User,
};

function makeColumn(id: number, name: string, position: number, isQueue: boolean): ColumnEntity {
	const column = new ColumnEntity();
	column.id = id;
	column.name = name;
	column.position = position;
	column.isQueue = isQueue;
	return column;
}

function makeTask(id: number, name: string, position: number, columnId = 1): TaskEntity {
	const task = new TaskEntity();
	task.id = id;
	task.name = name;
	task.position = position;
	task.column = makeColumn(columnId, "Col", 0, true);
	task.createdAt = new Date("2026-01-01T00:00:00.000Z");
	task.updatedAt = new Date("2026-01-01T00:00:00.000Z");
	return task;
}

function makeTag(id: number, name: string): TagEntity {
	const tag = new TagEntity();
	tag.id = id;
	tag.name = name;
	tag.createdAt = new Date("2026-01-01T00:00:00.000Z");
	tag.updatedAt = new Date("2026-01-01T00:00:00.000Z");
	return tag;
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
	renameBoard: ReturnType<typeof vi.fn>;
	deleteBoard: ReturnType<typeof vi.fn>;
	createColumn: ReturnType<typeof vi.fn>;
	updateColumn: ReturnType<typeof vi.fn>;
	deleteColumn: ReturnType<typeof vi.fn>;
	reorderColumns: ReturnType<typeof vi.fn>;
	createTask: ReturnType<typeof vi.fn>;
	updateTask: ReturnType<typeof vi.fn>;
	deleteTask: ReturnType<typeof vi.fn>;
	moveTask: ReturnType<typeof vi.fn>;
	claimTask: ReturnType<typeof vi.fn>;
	releaseTask: ReturnType<typeof vi.fn>;
	findTasksBySession: ReturnType<typeof vi.fn>;
	listTags: ReturnType<typeof vi.fn>;
	createTag: ReturnType<typeof vi.fn>;
	updateTag: ReturnType<typeof vi.fn>;
	deleteTag: ReturnType<typeof vi.fn>;
}

describe("KanbanController", () => {
	let controller: KanbanController;
	let service: ServiceMock;

	beforeEach(async () => {
		service = {
			createBoard: vi.fn(),
			all: vi.fn(),
			getBoard: vi.fn(),
			renameBoard: vi.fn(),
			deleteBoard: vi.fn(),
			createColumn: vi.fn(),
			updateColumn: vi.fn(),
			deleteColumn: vi.fn(),
			reorderColumns: vi.fn(),
			createTask: vi.fn(),
			updateTask: vi.fn(),
			deleteTask: vi.fn(),
			moveTask: vi.fn(),
			claimTask: vi.fn(),
			releaseTask: vi.fn(),
			findTasksBySession: vi.fn(),
			listTags: vi.fn(),
			createTag: vi.fn(),
			updateTag: vi.fn(),
			deleteTag: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [KanbanController],
			providers: [{ provide: KanbanService, useValue: service }],
		}).compile();
		controller = module.get(KanbanController);
	});

	it("createBoard maps the service result to a BoardResponse", async () => {
		service.createBoard.mockResolvedValue(makeBoard("abcd12", "New"));
		const res = await controller.createBoard({ name: "New" }, account);

		expect(service.createBoard).toHaveBeenCalledWith("New", "tester");
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
		const res = await controller.reorder("b1", { columnIds: [1, 2] }, account);

		expect(service.reorderColumns).toHaveBeenCalledWith("b1", [1, 2], "tester");
		expect(res).toEqual([
			{ id: 1, name: "Todo", position: 0, isQueue: true, pushDescription: null, pullDescription: null, tasks: [] },
			{ id: 2, name: "Done", position: 1, isQueue: false, pushDescription: null, pullDescription: null, tasks: [] },
		]);
	});

	it("renameBoard maps the service result to a BoardResponse", async () => {
		service.renameBoard.mockResolvedValue(makeBoard("abcd12", "Renamed"));
		const res = await controller.renameBoard("abcd12", { name: "Renamed" }, account);

		expect(service.renameBoard).toHaveBeenCalledWith("abcd12", "Renamed", "tester");
		expect(res.name).toBe("Renamed");
	});

	it("deleteBoard delegates to the service and returns nothing", async () => {
		service.deleteBoard.mockResolvedValue(undefined);
		await expect(controller.deleteBoard("abcd12", account)).resolves.toBeUndefined();
		expect(service.deleteBoard).toHaveBeenCalledWith("abcd12", "tester");
	});

	it("createColumn maps the service result to a ColumnResponse", async () => {
		service.createColumn.mockResolvedValue(makeColumn(4, "Review", 3, true));
		const res = await controller.createColumn("b1", { name: "Review", isQueue: true }, account);

		expect(service.createColumn).toHaveBeenCalledWith("b1", "Review", true, "tester");
		expect(res).toEqual({ id: 4, name: "Review", position: 3, isQueue: true, pushDescription: null, pullDescription: null, tasks: [] });
	});

	it("updateColumn passes the parsed column id through", async () => {
		service.updateColumn.mockResolvedValue(makeColumn(2, "Done", 1, false));
		const res = await controller.updateColumn("b1", 2, { name: "Done" }, account);

		expect(service.updateColumn).toHaveBeenCalledWith("b1", 2, { name: "Done" }, "tester");
		expect(res.name).toBe("Done");
	});

	it("deleteColumn passes the parsed column id through", async () => {
		service.deleteColumn.mockResolvedValue(undefined);
		await expect(controller.deleteColumn("b1", 2, account)).resolves.toBeUndefined();
		expect(service.deleteColumn).toHaveBeenCalledWith("b1", 2, "tester");
	});

	it("createTask maps the service result to a TaskResponse", async () => {
		service.createTask.mockResolvedValue(makeTask(7, "Ship it", 2));
		const res = await controller.createTask("b1", 1, { name: "Ship it" }, account);

		expect(service.createTask).toHaveBeenCalledWith("b1", 1, { name: "Ship it" }, "tester");
		expect(res).toEqual({
			id: 7,
			columnId: 1,
			name: "Ship it",
			description: null,
			position: 2,
			claimedBy: null,
			sessionId: null,
			priority: null,
			estimate: null,
			assignee: null,
			dueAt: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			todos: [],
			tags: [],
			dependsOn: [],
			dependents: [],
		});
	});

	it("updateTask passes the parsed ids through", async () => {
		service.updateTask.mockResolvedValue(makeTask(7, "Shipped", 2));
		const res = await controller.updateTask("b1", 1, 7, { name: "Shipped" }, account);

		expect(service.updateTask).toHaveBeenCalledWith("b1", 1, 7, { name: "Shipped" }, "tester");
		expect(res.name).toBe("Shipped");
	});

	it("deleteTask passes the parsed ids through", async () => {
		service.deleteTask.mockResolvedValue(undefined);
		await expect(controller.deleteTask("b1", 1, 7, account)).resolves.toBeUndefined();
		expect(service.deleteTask).toHaveBeenCalledWith("b1", 1, 7, "tester");
	});

	it("moveTask delegates to the service", async () => {
		service.moveTask.mockResolvedValue(makeTask(7, "Ship it", 0));
		const res = await controller.moveTask("b1", 7, { columnId: 2, position: 0 }, account);

		expect(service.moveTask).toHaveBeenCalledWith("b1", 7, { columnId: 2, position: 0 }, "tester");
		expect(res.position).toBe(0);
	});

	it("claimTask claims as the authenticated account and forwards the session", async () => {
		service.claimTask.mockResolvedValue(makeTask(7, "Ship it", 0));
		await controller.claimTask("b1", 1, 7, { sessionId: "ses_abc" }, account);

		expect(service.claimTask).toHaveBeenCalledWith("b1", 1, 7, "tester", "ses_abc");
	});

	it("claimTask tolerates a missing body", async () => {
		service.claimTask.mockResolvedValue(makeTask(7, "Ship it", 0));
		await controller.claimTask("b1", 1, 7, {}, account);

		expect(service.claimTask).toHaveBeenCalledWith("b1", 1, 7, "tester", undefined);
	});

	it("getTasksBySession maps each linked task to a SessionTaskResponse", async () => {
		const task = makeTask(7, "Ship it", 0);
		service.findTasksBySession.mockResolvedValue([{ board: { id: "b1" }, task }]);

		const res = await controller.getTasksBySession("ses_abc");

		expect(service.findTasksBySession).toHaveBeenCalledWith("ses_abc");
		expect(res).toHaveLength(1);
		expect(res[0].boardId).toBe("b1");
		expect(res[0].task.id).toBe(7);
	});

	it("releaseTask passes the parsed ids through", async () => {
		service.releaseTask.mockResolvedValue(makeTask(7, "Ship it", 0));
		await controller.releaseTask("b1", 1, 7, account);
		expect(service.releaseTask).toHaveBeenCalledWith("b1", 1, 7, "tester");
	});

	it("listTags maps tags to TagResponse", async () => {
		service.listTags.mockResolvedValue([makeTag(1, "frontend")]);
		const res = await controller.listTags("b1");

		expect(service.listTags).toHaveBeenCalledWith("b1");
		expect(res).toEqual([
			{
				id: 1,
				name: "frontend",
				description: null,
				prompt: null,
				color: null,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		]);
	});

	it("createTag passes the dto through and maps the response", async () => {
		service.createTag.mockResolvedValue(makeTag(2, "backend"));
		const res = await controller.createTag("b1", { name: "backend" }, account);

		expect(service.createTag).toHaveBeenCalledWith("b1", { name: "backend" }, "tester");
		expect(res.name).toBe("backend");
	});

	it("updateTag passes the parsed tag id through", async () => {
		service.updateTag.mockResolvedValue(makeTag(2, "backend-renamed"));
		const res = await controller.updateTag("b1", 2, { name: "backend-renamed" }, account);

		expect(service.updateTag).toHaveBeenCalledWith("b1", 2, {
			name: "backend-renamed",
		}, "tester");
		expect(res.name).toBe("backend-renamed");
	});

	it("deleteTag passes the parsed tag id through", async () => {
		service.deleteTag.mockResolvedValue(undefined);
		await expect(controller.deleteTag("b1", 2, account)).resolves.toBeUndefined();
		expect(service.deleteTag).toHaveBeenCalledWith("b1", 2, "tester");
	});

	it("propagates a 404 from the service", async () => {
		service.getBoard.mockRejectedValue(new NotFoundException("nope"));
		await expect(controller.getBoard("missing")).rejects.toBeInstanceOf(NotFoundException);
	});
});
