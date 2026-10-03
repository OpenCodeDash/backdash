import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import {
	createTestContext,
	type TestContext,
} from "../../test/mikro-orm.test-helper.js";
import type { MessageEvent } from "@nestjs/common";
import { KanbanModule } from "./kanban.module.js";
import { KanbanService } from "./kanban.service.js";
import { EventsService } from "../events/events.service.js";
import { ColumnEntity } from "./entity/column.entity.js";
import { TaskEntity } from "./entity/task.entity.js";
import { TagEntity } from "./entity/tag.entity.js";
import { TaskPriority } from "./enum/task-priority.enum.js";
import { TaskTodoStatus } from "./enum/task-todo-status.enum.js";
import { EventEntity } from "../events/entity/event.entity.js";
import { EventType } from "../events/enum/event-type.enum.js";

let ctx: TestContext;
let service: KanbanService;

beforeEach(async () => {
	ctx = await createTestContext([KanbanModule]);
	service = ctx.module.get(KanbanService);
});

afterEach(async () => {
	await ctx.module.close();
});

async function eventsOfType(type: EventType) {
	return ctx.em.find(EventEntity, { type }, { orderBy: { seq: "asc" } });
}

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

	it("getBoard throws 404 for a missing board", async () => {
		await expect(service.getBoard("zzzzzz")).rejects.toBeInstanceOf(
			NotFoundException
		);
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

	it("createBoard emits a board.created event with the board payload", async () => {
		const board = await service.createBoard("Emitted");
		const [event] = await eventsOfType(EventType.BoardCreated);

		expect(event).toBeDefined();
		expect(event.board.id).toBe(board.id);
		expect(event.actor).toBe("dashboard");
		expect(event.payload).toMatchObject({ id: board.id, name: "Emitted" });
	});

	it("renameBoard updates the name and emits board.updated", async () => {
		const board = await service.createBoard("Old");
		const renamed = await service.renameBoard(board.id, "New");

		expect(renamed.name).toBe("New");
		const [event] = await eventsOfType(EventType.BoardUpdated);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ id: board.id, name: "New" });
	});

	it("renameBoard throws 404 for a missing board", async () => {
		await expect(service.renameBoard("zzzzzz", "New")).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("deleteBoard removes the board and its columns, emitting board.deleted live", async () => {
		const board = await service.createBoard("Doomed");
		const eventsService = ctx.module.get(EventsService);
		const received: MessageEvent[] = [];
		const sub = eventsService
			.stream(board.id)
			.subscribe((m) => received.push(m));

		await service.deleteBoard(board.id);

		sub.unsubscribe();

		expect(await service.boardExists(board.id)).toBe(false);
		expect(await ctx.em.count(ColumnEntity, { board: board.id })).toBe(0);

		// The board.deleted row itself is cascade-deleted with the board, so
		// assert on what live subscribers actually receive
		const deleted = received.find(
			(m) => (m.data as { type: string }).type === EventType.BoardDeleted
		);
		expect(deleted).toBeDefined();
		expect(deleted!.data).toMatchObject({
			boardId: board.id,
			type: EventType.BoardDeleted,
			actor: "dashboard",
			payload: { id: board.id, name: "Doomed" },
		});
	});

	it("deleteBoard throws 404 for a missing board", async () => {
		await expect(service.deleteBoard("zzzzzz")).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("createColumn appends at the end and emits column.added", async () => {
		const board = await service.createBoard("Cols");
		const column = await service.createColumn(board.id, "Review", true);

		expect(column.position).toBe(3);
		expect(column.isQueue).toBe(true);
		const [event] = await eventsOfType(EventType.ColumnAdded);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ id: column.id!, name: "Review", isQueue: true });
	});

	it("createColumn rejects a duplicate name with 409", async () => {
		const board = await service.createBoard("Dupes");
		await expect(
			service.createColumn(board.id, "Todo")
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("createColumn throws 404 for a missing board", async () => {
		await expect(
			service.createColumn("zzzzzz", "Review")
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("updateColumn changes fields and emits column.updated", async () => {
		const board = await service.createBoard("Upd");
		const [todo] = await service.getBoard(board.id).then((b) => b.columns.toArray());
		const updated = await service.updateColumn(board.id, todo.id!, {
			name: "Ready",
			pushDescription: "push me",
		});

		expect(updated.name).toBe("Ready");
		expect(updated.pushDescription).toBe("push me");
		const [event] = await eventsOfType(EventType.ColumnUpdated);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ id: todo.id, name: "Ready" });
	});

	it("updateColumn preserves the column's tasks when toggling isQueue", async () => {
		const board = await service.createBoard("QueueToggle");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Kept" });

		const updated = await service.updateColumn(board.id, todo.id!, {
			isQueue: false,
		});

		// The response must carry the column's tasks, otherwise the client's
		// column patch wipes them
		expect(updated.tasks.isInitialized()).toBe(true);
		expect(updated.tasks.toArray().map((t) => t.name)).toEqual(["Kept"]);
		expect(task.id).toBe(updated.tasks.toArray()[0]!.id);
	});

	it("updateColumn rejects a rename to a duplicate name with 409", async () => {
		const board = await service.createBoard("DupUpd");
		const [todo] = await service.getBoard(board.id).then((b) => b.columns.toArray());
		await expect(
			service.updateColumn(board.id, todo.id!, { name: "Done" })
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("updateColumn throws 404 for a missing column", async () => {
		const board = await service.createBoard("MissCol");
		await expect(
			service.updateColumn(board.id, 9999, { name: "X" })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("deleteColumn removes the column and emits column.deleted", async () => {
		const board = await service.createBoard("DelCol");
		const [todo] = await service.getBoard(board.id).then((b) => b.columns.toArray());
		await service.deleteColumn(board.id, todo.id!);

		// Query the DB directly: the cached board instance's columns collection
		// is not re-populated across forks
		const remaining = await ctx.em.find(
			ColumnEntity,
			{ board: board.id },
			{ orderBy: { position: "asc" } }
		);
		expect(remaining.map((c) => c.name)).toEqual(["In Progress", "Done"]);
		const [event] = await eventsOfType(EventType.ColumnDeleted);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ id: todo.id, name: "Todo" });
	});

	it("reorderColumns emits column.reordered with the new order", async () => {
		const board = await service.createBoard("Reordered");
		const ids = board.columns.map((c) => c.id!);
		await service.reorderColumns(board.id, [ids[2], ids[0], ids[1]]);

		const [event] = await eventsOfType(EventType.ColumnReordered);
		expect(event).toBeDefined();
		const columns = event.payload.columns as { name: string }[];
		expect(columns.map((c) => c.name)).toEqual(["Done", "Todo", "In Progress"]);
	});

	it("createTask appends at the end and emits task.created", async () => {
		const board = await service.createBoard("Tasks");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, {
			name: "First",
			description: "do it",
		});

		expect(task.position).toBe(0);
		expect(task.description).toBe("do it");
		const [event] = await eventsOfType(EventType.TaskCreated);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ name: "First", description: "do it" });
	});

	it("createTask throws 404 for a missing column", async () => {
		const board = await service.createBoard("TaskMissCol");
		await expect(
			service.createTask(board.id, 9999, { name: "X" })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("updateTask changes fields and emits task.updated", async () => {
		const board = await service.createBoard("UpdTask");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Old" });
		const updated = await service.updateTask(board.id, todo.id!, task.id!, {
			name: "New",
			description: "desc",
		});

		expect(updated.name).toBe("New");
		expect(updated.description).toBe("desc");
		const [event] = await eventsOfType(EventType.TaskUpdated);
		expect(event.payload).toMatchObject({ name: "New", description: "desc" });
	});

	it("updateTask throws 404 for a missing task", async () => {
		const board = await service.createBoard("UpdTaskMiss");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		await expect(
			service.updateTask(board.id, todo.id!, 9999, { name: "X" })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("deleteTask removes the task and emits task.deleted", async () => {
		const board = await service.createBoard("DelTask");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Gone" });
		await service.deleteTask(board.id, todo.id!, task.id!);

		expect(await ctx.em.count(TaskEntity, { id: task.id! })).toBe(0);
		const [event] = await eventsOfType(EventType.TaskDeleted);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ name: "Gone", columnId: todo.id });
	});

	it("moveTask reorders within a column and emits task.moved", async () => {
		const board = await service.createBoard("MvIn");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		await service.createTask(board.id, todo.id!, { name: "A" });
		const b = await service.createTask(board.id, todo.id!, { name: "B" });

		await service.moveTask(board.id, b.id!, { columnId: todo.id!, position: 0 });

		const after = await ctx.em.find(TaskEntity, { column: todo.id! }, {
			orderBy: { position: "asc" },
		});
		expect(after.map((t) => t.name)).toEqual(["B", "A"]);
		const [event] = await eventsOfType(EventType.TaskMoved);
		expect(event.payload).toMatchObject({ name: "B", columnId: todo.id });
	});

	it("moveTask transfers a task between columns and emits task.moved", async () => {
		const board = await service.createBoard("MvX");
		const cols = (await service.getBoard(board.id)).columns.toArray();
		const todo = cols.find((c) => c.name === "Todo")!;
		const inProgress = cols.find((c) => c.name === "In Progress")!;
		const task = await service.createTask(board.id, todo.id!, { name: "Move me" });

		await service.moveTask(board.id, task.id!, { columnId: inProgress.id! });

		const moved = await ctx.em.find(TaskEntity, { column: inProgress.id! });
		expect(moved.map((t) => t.name)).toEqual(["Move me"]);
		expect(await ctx.em.count(TaskEntity, { column: todo.id! })).toBe(0);
		const [event] = await eventsOfType(EventType.TaskMoved);
		expect(event.payload).toMatchObject({ name: "Move me", columnId: inProgress.id });
	});

	it("claimTask marks the task and emits task.claimed with the actor", async () => {
		const board = await service.createBoard("Claim");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Claim me" });

		const claimed = await service.claimTask(board.id, todo.id!, task.id!, "agent-7");
		expect(claimed.claimedBy).toBe("agent-7");
		const [event] = await eventsOfType(EventType.TaskClaimed);
		expect(event.actor).toBe("agent-7");
		expect(event.payload).toMatchObject({ name: "Claim me", claimedBy: "agent-7" });
	});

	it("claimTask defaults the actor to the dashboard", async () => {
		const board = await service.createBoard("ClaimDef");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "X" });
		const claimed = await service.claimTask(board.id, todo.id!, task.id!);
		expect(claimed.claimedBy).toBe("dashboard");
	});

	it("claimTask rejects a non-queue column with 400", async () => {
		const board = await service.createBoard("ClaimNoQueue");
		const cols = (await service.getBoard(board.id)).columns.toArray();
		const inProgress = cols.find((c) => c.name === "In Progress")!;
		const task = await service.createTask(board.id, inProgress.id!, { name: "No queue" });
		await expect(
			service.claimTask(board.id, inProgress.id!, task.id!)
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("claimTask rejects an already-claimed task with 409", async () => {
		const board = await service.createBoard("ClaimTwice");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Twice" });
		await service.claimTask(board.id, todo.id!, task.id!, "agent-1");
		await expect(
			service.claimTask(board.id, todo.id!, task.id!, "agent-2")
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("releaseTask clears the claim and emits task.released", async () => {
		const board = await service.createBoard("Release");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "Release me" });
		await service.claimTask(board.id, todo.id!, task.id!, "agent-1");
		const released = await service.releaseTask(board.id, todo.id!, task.id!);

		expect(released.claimedBy).toBe("");
		const [event] = await eventsOfType(EventType.TaskReleased);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({ name: "Release me", claimedBy: null });
	});

	it("releaseTask rejects an unclaimed task with 409", async () => {
		const board = await service.createBoard("ReleaseNone");
		const [todo] = (await service.getBoard(board.id)).columns.toArray();
		const task = await service.createTask(board.id, todo.id!, { name: "None" });
		await expect(
			service.releaseTask(board.id, todo.id!, task.id!)
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("KanbanService tags and task metadata", () => {
	async function firstColumn(boardId: string) {
		const board = await service.getBoard(boardId);
		return board.columns.toArray()[0];
	}

	it("createTag stores its fields and emits tag.added", async () => {
		const board = await service.createBoard("Tags");
		const tag = await service.createTag(board.id, {
			name: "frontend",
			description: "UI work",
			prompt: "Follow the design system",
			color: "#ff0000",
		});

		expect(tag.name).toBe("frontend");
		expect(tag.description).toBe("UI work");
		expect(tag.prompt).toBe("Follow the design system");
		const [event] = await eventsOfType(EventType.TagAdded);
		expect(event).toBeDefined();
		expect(event.payload).toMatchObject({
			name: "frontend",
			description: "UI work",
			color: "#ff0000",
		});
	});

	it("createTag rejects a duplicate name with 409", async () => {
		const board = await service.createBoard("TagDupes");
		await service.createTag(board.id, { name: "dupe" });
		await expect(
			service.createTag(board.id, { name: "dupe" })
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("createTag allows the same name on different boards", async () => {
		const one = await service.createBoard("TagOne");
		const two = await service.createBoard("TagTwo");
		await expect(service.createTag(one.id, { name: "same" })).resolves.toBeDefined();
		await expect(service.createTag(two.id, { name: "same" })).resolves.toBeDefined();
	});

	it("createTag throws 404 for a missing board", async () => {
		await expect(
			service.createTag("zzzzzz", { name: "x" })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("listTags returns the board's tags alphabetically", async () => {
		const board = await service.createBoard("TagList");
		await service.createTag(board.id, { name: "b" });
		await service.createTag(board.id, { name: "a" });
		expect((await service.listTags(board.id)).map((tag) => tag.name)).toEqual([
			"a",
			"b",
		]);
		await expect(service.listTags("zzzzzz")).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("updateTag updates fields, clears with null, and emits tag.updated", async () => {
		const board = await service.createBoard("TagUpd");
		const tag = await service.createTag(board.id, {
			name: "t",
			color: "#000000",
		});
		const updated = await service.updateTag(board.id, tag.id!, {
			name: "t2",
			color: null,
		});

		expect(updated.name).toBe("t2");
		expect(updated.color).toBeNull();
		const [event] = await eventsOfType(EventType.TagUpdated);
		expect(event.payload).toMatchObject({ name: "t2", color: null });
	});

	it("updateTag rejects a rename to a duplicate name with 409", async () => {
		const board = await service.createBoard("TagUpdDup");
		await service.createTag(board.id, { name: "one" });
		const two = await service.createTag(board.id, { name: "two" });
		await expect(
			service.updateTag(board.id, two.id!, { name: "one" })
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("updateTag throws 404 for a missing tag", async () => {
		const board = await service.createBoard("TagUpdMiss");
		await expect(
			service.updateTag(board.id, 9999, { name: "x" })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("deleteTag removes the tag and emits tag.deleted", async () => {
		const board = await service.createBoard("TagDel");
		const tag = await service.createTag(board.id, { name: "gone" });
		await service.deleteTag(board.id, tag.id!);

		expect(await ctx.em.count(TagEntity, { board: board.id })).toBe(0);
		const [event] = await eventsOfType(EventType.TagDeleted);
		expect(event.payload).toMatchObject({ id: tag.id, name: "gone" });
	});

	it("createTask persists metadata and attaches tags", async () => {
		const board = await service.createBoard("TaskMeta");
		const column = await firstColumn(board.id);
		const tag = await service.createTag(board.id, {
			name: "backend",
			prompt: "use pnpm",
		});
		const task = await service.createTask(board.id, column.id!, {
			name: "API",
			priority: TaskPriority.High,
			estimate: 3,
			assignee: "alice",
			dueAt: "2026-11-01",
			tagIds: [tag.id!],
		});

		expect(task.priority).toBe(TaskPriority.High);
		expect(task.estimate).toBe(3);
		expect(task.assignee).toBe("alice");
		expect(task.dueAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
		expect(task.tags.getItems().map((t) => t.name)).toEqual(["backend"]);

		const [event] = await eventsOfType(EventType.TaskCreated);
		expect(event.payload).toMatchObject({
			name: "API",
			priority: "high",
			estimate: 3,
			assignee: "alice",
			dueAt: "2026-11-01T00:00:00.000Z",
		});
		expect(
			(event.payload.tags as { name: string }[]).map((t) => t.name)
		).toEqual(["backend"]);
	});

	it("updateTask replaces tags and clears nullable fields with null", async () => {
		const board = await service.createBoard("TaskUpdMeta");
		const column = await firstColumn(board.id);
		const first = await service.createTag(board.id, { name: "aaa" });
		const second = await service.createTag(board.id, { name: "ccc" });
		const task = await service.createTask(board.id, column.id!, {
			name: "T",
			priority: TaskPriority.Low,
			tagIds: [first.id!],
		});

		const updated = await service.updateTask(board.id, column.id!, task.id!, {
			priority: null,
			assignee: "bob",
			tagIds: [second.id!],
		});

		expect(updated.priority).toBeNull();
		expect(updated.estimate).toBeNull();
		expect(updated.assignee).toBe("bob");
		expect(updated.tags.getItems().map((t) => t.name)).toEqual(["ccc"]);

		const [event] = await eventsOfType(EventType.TaskUpdated);
		expect(event.payload).toMatchObject({
			id: task.id,
			priority: null,
			assignee: "bob",
		});
		expect(
			(event.payload.tags as { name: string }[]).map((t) => t.name)
		).toEqual(["ccc"]);
	});

	it("createTask persists the initial checklist", async () => {
		const board = await service.createBoard("TaskTodos");
		const column = await firstColumn(board.id);
		const task = await service.createTask(board.id, column.id!, {
			name: "T",
			todos: [
				{ content: "write code", status: TaskTodoStatus.Pending },
				{ content: "run tests", status: TaskTodoStatus.InProgress },
			],
		});

		expect(task.todos).toEqual([
			{ content: "write code", status: TaskTodoStatus.Pending },
			{ content: "run tests", status: TaskTodoStatus.InProgress },
		]);

		const [event] = await eventsOfType(EventType.TaskCreated);
		expect(event.payload).toMatchObject({
			todos: [
				{ content: "write code", status: "pending" },
				{ content: "run tests", status: "in_progress" },
			],
		});
	});

	it("createTask defaults an empty checklist when none is provided", async () => {
		const board = await service.createBoard("TaskTodosEmpty");
		const column = await firstColumn(board.id);
		const task = await service.createTask(board.id, column.id!, { name: "T" });
		expect(task.todos).toEqual([]);
	});

	it("updateTask replaces the checklist wholesale and [] clears it", async () => {
		const board = await service.createBoard("TaskTodosUpd");
		const column = await firstColumn(board.id);
		const task = await service.createTask(board.id, column.id!, {
			name: "T",
			todos: [{ content: "a", status: TaskTodoStatus.Pending }],
		});

		const replaced = await service.updateTask(board.id, column.id!, task.id!, {
			todos: [
				{ content: "a", status: TaskTodoStatus.Completed },
				{ content: "b", status: TaskTodoStatus.Pending },
			],
		});
		expect(replaced.todos).toEqual([
			{ content: "a", status: TaskTodoStatus.Completed },
			{ content: "b", status: TaskTodoStatus.Pending },
		]);

		const cleared = await service.updateTask(board.id, column.id!, task.id!, {
			todos: [],
		});
		expect(cleared.todos).toEqual([]);

		// Confirm the [] actually hit the JSON column, not just the in-memory copy
		ctx.em.clear();
		const reloaded = (await ctx.em.find(TaskEntity, { id: task.id! }))[0];
		expect(reloaded.todos).toEqual([]);
	});

	it("updateTask rejects tags from another board with 404", async () => {
		const one = await service.createBoard("TagBorrow1");
		const two = await service.createBoard("TagBorrow2");
		const column = await firstColumn(one.id);
		const foreign = await service.createTag(two.id, { name: "foreign" });
		const task = await service.createTask(one.id, column.id!, { name: "T" });

		await expect(
			service.updateTask(one.id, column.id!, task.id!, {
				tagIds: [foreign.id!],
			})
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("getBoard includes the board's tags", async () => {
		const board = await service.createBoard("BoardTags");
		await service.createTag(board.id, { name: "zeta" });
		await service.createTag(board.id, { name: "alpha" });

		// Drop the identity map so getBoard reloads the collection rather than
		// returning the board cached by createBoard before the tags existed
		ctx.em.clear();
		const loaded = await service.getBoard(board.id);
		expect(loaded.tags.getItems().map((t) => t.name)).toEqual(["alpha", "zeta"]);
	});

	it("claimTask response keeps the task's tags", async () => {
		const board = await service.createBoard("ClaimTags");
		const column = await firstColumn(board.id);
		const tag = await service.createTag(board.id, { name: "codebase:foo" });
		const task = await service.createTask(board.id, column.id!, {
			name: "T",
			tagIds: [tag.id!],
		});

		const claimed = await service.claimTask(board.id, column.id!, task.id!, "agent-1");
		expect(claimed.tags.getItems().map((t) => t.name)).toEqual(["codebase:foo"]);
	});

	it("updateColumn keeps its tasks' tags in the event payload", async () => {
		const board = await service.createBoard("ColTags");
		const columns = (await service.getBoard(board.id)).columns.toArray();
		const inProgress = columns[1];
		const tag = await service.createTag(board.id, { name: "x" });
		await service.createTask(board.id, inProgress.id!, {
			name: "T",
			tagIds: [tag.id!],
		});

		await service.updateColumn(board.id, inProgress.id!, { isQueue: true });

		const [event] = await eventsOfType(EventType.ColumnUpdated);
		const tasks = (event.payload as { tasks: { tags: { name: string }[] }[] })
			.tasks;
		expect(tasks[0].tags.map((t) => t.name)).toEqual(["x"]);
	});
});

describe("KanbanService task dependencies", () => {
	async function firstColumn(boardId: string) {
		const board = await service.getBoard(boardId);
		return board.columns.toArray()[0];
	}

	async function allTasks(boardId: string): Promise<TaskEntity[]> {
		ctx.em.clear();
		const board = await service.getBoard(boardId);
		const tasks: TaskEntity[] = [];
		for (const column of board.columns) {
			for (const task of column.tasks) {
				tasks.push(task);
			}
		}
		return tasks;
	}

	it("createTask stores dependencies and emits them on task.created", async () => {
		const board = await service.createBoard("DepsCreate");
		const column = await firstColumn(board.id);
		const base = await service.createTask(board.id, column.id!, { name: "Base" });
		const dependent = await service.createTask(board.id, column.id!, {
			name: "Dependent",
			dependsOn: [base.id!],
		});

		expect(dependent.dependsOn.getItems().map((t) => t.id)).toEqual([base.id]);

		const created = await eventsOfType(EventType.TaskCreated);
		const event = created.find(
			(e) => (e.payload as { name: string }).name === "Dependent"
		)!;
		expect((event.payload as { dependsOn: number[] }).dependsOn).toEqual([
			base.id,
		]);
	});

	it("createTask rejects a dependency from another board with 404", async () => {
		const one = await service.createBoard("DepsCreateOne");
		const two = await service.createBoard("DepsCreateTwo");
		const colOne = await firstColumn(one.id);
		const colTwo = await firstColumn(two.id);
		const foreign = await service.createTask(two.id, colTwo.id!, { name: "Foreign" });

		await expect(
			service.createTask(one.id, colOne.id!, {
				name: "Local",
				dependsOn: [foreign.id!],
			})
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("updateTask replaces and clears dependencies", async () => {
		const board = await service.createBoard("DepsUpdate");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		const b = await service.createTask(board.id, column.id!, { name: "B" });
		const c = await service.createTask(board.id, column.id!, { name: "C" });

		const updated = await service.updateTask(board.id, column.id!, c.id!, {
			dependsOn: [a.id!, b.id!],
		});
		expect(updated.dependsOn.getItems().map((t) => t.name).sort()).toEqual([
			"A",
			"B",
		]);

		const cleared = await service.updateTask(board.id, column.id!, c.id!, {
			dependsOn: [],
		});
		expect(cleared.dependsOn.getItems()).toEqual([]);
	});

	it("updateTask emits the new dependencies on task.updated", async () => {
		const board = await service.createBoard("DepsEvent");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		const b = await service.createTask(board.id, column.id!, { name: "B" });

		await service.updateTask(board.id, column.id!, b.id!, { dependsOn: [a.id!] });

		const updated = await eventsOfType(EventType.TaskUpdated);
		const event = updated.find(
			(e) => (e.payload as { name: string }).name === "B"
		)!;
		expect((event.payload as { dependsOn: number[] }).dependsOn).toEqual([
			a.id,
		]);
	});

	it("exposes dependents on the depended-upon task via getBoard", async () => {
		const board = await service.createBoard("DepsReverse");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		await service.createTask(board.id, column.id!, {
			name: "B",
			dependsOn: [a.id!],
		});

		const tasks = await allTasks(board.id);
		const aTask = tasks.find((t) => t.id === a.id)!;
		expect(aTask.dependents.getItems().map((t) => t.name)).toEqual(["B"]);
	});

	it("rejects a self-dependency with 400", async () => {
		const board = await service.createBoard("DepsSelf");
		const column = await firstColumn(board.id);
		const task = await service.createTask(board.id, column.id!, { name: "Self" });

		await expect(
			service.updateTask(board.id, column.id!, task.id!, {
				dependsOn: [task.id!],
			})
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("rejects a direct cycle with 400", async () => {
		const board = await service.createBoard("DepsCycle");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		const b = await service.createTask(board.id, column.id!, {
			name: "B",
			dependsOn: [a.id!],
		});

		// b -> a, so making a depend on b closes the loop
		await expect(
			service.updateTask(board.id, column.id!, a.id!, { dependsOn: [b.id!] })
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("rejects a transitive cycle with 400", async () => {
		const board = await service.createBoard("DepsTransitive");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		const b = await service.createTask(board.id, column.id!, {
			name: "B",
			dependsOn: [a.id!],
		});
		const c = await service.createTask(board.id, column.id!, {
			name: "C",
			dependsOn: [b.id!],
		});

		// c -> b -> a, so making a depend on c closes the loop
		await expect(
			service.updateTask(board.id, column.id!, a.id!, { dependsOn: [c.id!] })
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("clears dependency edges when a depended-upon task is deleted", async () => {
		const board = await service.createBoard("DepsDelete");
		const column = await firstColumn(board.id);
		const a = await service.createTask(board.id, column.id!, { name: "A" });
		const b = await service.createTask(board.id, column.id!, {
			name: "B",
			dependsOn: [a.id!],
		});

		await service.deleteTask(board.id, column.id!, a.id!);

		const tasks = await allTasks(board.id);
		const bTask = tasks.find((t) => t.id === b.id)!;
		expect(bTask.dependsOn.getItems()).toEqual([]);
	});
});
