import { InjectRepository } from "@mikro-orm/nestjs";
import {
	EntityManager,
	NotFoundError,
	UniqueConstraintViolationException,
} from "@mikro-orm/core";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { BoardEntity } from "./entity/board.entity.js";
import { BoardRepository } from "./repository/board.repository.js";
import { ColumnEntity } from "./entity/column.entity.js";
import { ColumnRepository } from "./repository/column.repository.js";
import { TaskEntity } from "./entity/task.entity.js";
import { TagEntity } from "./entity/tag.entity.js";
import { TagRepository } from "./repository/tag.repository.js";
import { EventsService } from "../events/events.service.js";
import { EventEntity } from "../events/entity/event.entity.js";
import { EventRepository } from "../events/repository/event.repository.js";
import { EventType } from "../events/enum/event-type.enum.js";
import { EventResponse } from "../events/response/event.response.js";
import { BoardResponse } from "./response/board-detail.response.js";
import { ColumnResponse } from "./response/column.response.js";
import { TaskResponse } from "./response/task.response.js";
import { TagResponse } from "./response/tag.response.js";
import { UpdateColumnDto } from "./dto/update-column.dto.js";
import { CreateTaskDto } from "./dto/create-task.dto.js";
import { UpdateTaskDto } from "./dto/update-task.dto.js";
import { CreateTagDto } from "./dto/create-tag.dto.js";
import { UpdateTagDto } from "./dto/update-tag.dto.js";
import { MoveTaskDto } from "./dto/move-task.dto.js";

// All mutations originate from the dashboard UI until agents exist
const ACTOR = "dashboard";

@Injectable()
export class KanbanService {
	constructor(
		private readonly em: EntityManager,
		@InjectRepository(BoardEntity)
		private readonly boardsRepo: BoardRepository,
		@InjectRepository(ColumnEntity)
		private readonly columnsRepo: ColumnRepository,
		@InjectRepository(TagEntity)
		private readonly tagsRepo: TagRepository,
		private readonly events: EventsService
	) {}

	async createBoard(name: string): Promise<BoardEntity> {
		const board = await this.boardsRepo.newBoard(name);

		await this.recordEvent(
			board,
			EventType.BoardCreated,
			{ ...BoardResponse.from(board) }
		);

		return board;
	}

	all() {
		return this.boardsRepo.findAll();
	}

	getBoard(id: string): Promise<BoardEntity> {
		// findOneOrFail throws MikroORM's NotFoundError, which Nest would
		// surface as a 500; translate it to a proper 404
		return this.boardsRepo.findWithColumns(id).catch((error: unknown) => {
			if (error instanceof NotFoundError) {
				throw new NotFoundException(`Board '${id}' not found`);
			}

			throw error;
		});
	}

	async renameBoard(id: string, name: string): Promise<BoardEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, id);

		board.name = name;
		const event = this.eventsRepo(em).append(
			board,
			EventType.BoardUpdated,
			ACTOR,
			{ ...BoardResponse.from(board) }
		);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return board;
	}

	async deleteBoard(id: string): Promise<void> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, id);
		const boardId = board.id;
		const name = board.name;

		const event = this.eventsRepo(em).append(
			board,
			EventType.BoardDeleted,
			ACTOR,
			{ id: boardId, name }
		);

		await em.remove(board).flush();

		// The cascade detaches the board and clears event.board, so the wire
		// message is built from the values captured before the removal
		this.events.publish([
			{
				seq: event.seq as number,
				boardId,
				type: EventType.BoardDeleted,
				actor: ACTOR,
				payload: { id: boardId, name },
				createdAt: (event.createdAt ?? new Date()).toISOString(),
			},
		]);
	}

	async createColumn(
		boardId: string,
		name: string,
		isQueue = false
	): Promise<ColumnEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);

		const event = this.eventsRepo(em).append(
			board,
			EventType.ColumnAdded,
			ACTOR
		);
		let column: ColumnEntity;

		try {
			column = em.create(ColumnEntity, {
				board,
				name,
				position: await this.nextPosition(em, boardId),
				isQueue,
			});

			// column.id only exists after the first flush, so the payload is
			// filled in a second one
			await em.persist(column).flush();
			event.payload = { ...ColumnResponse.from(column) };
			await em.flush();
		} catch (error) {
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(
					`A column named '${name}' already exists on this board`
				);
			}

			throw error;
		}

		this.events.publish([EventResponse.from(event)]);

		return column;
	}

	async updateColumn(
		boardId: string,
		columnId: number,
		dto: UpdateColumnDto
	): Promise<ColumnEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		// Load with tasks (and their tags) populated so the response and the
		// column.updated event payload do not degrade to [] and wipe the
		// client's column/task state
		const column = await this.loadColumn(em, boardId, columnId, true);

		if (dto.name !== undefined) {
			column.name = dto.name;
		}
		if (dto.isQueue !== undefined) {
			column.isQueue = dto.isQueue;
		}
		if (dto.pushDescription !== undefined) {
			column.pushDescription = dto.pushDescription;
		}
		if (dto.pullDescription !== undefined) {
			column.pullDescription = dto.pullDescription;
		}

		const event = this.eventsRepo(em).append(
			board,
			EventType.ColumnUpdated,
			ACTOR,
			{ ...ColumnResponse.from(column) }
		);

		try {
			await em.flush();
		} catch (error) {
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(
					`A column named '${dto.name}' already exists on this board`
				);
			}

			throw error;
		}

		this.events.publish([EventResponse.from(event)]);

		return column;
	}

	async deleteColumn(boardId: string, columnId: number): Promise<void> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const column = await this.loadColumn(em, boardId, columnId);

		const event = this.eventsRepo(em).append(
			board,
			EventType.ColumnDeleted,
			ACTOR,
			{ id: column.id, name: column.name }
		);

		await em.remove(column).flush();
		this.events.publish([EventResponse.from(event)]);
	}

	async listTags(boardId: string): Promise<TagEntity[]> {
		if (!(await this.boardExists(boardId))) {
			throw new NotFoundException(`Board '${boardId}' not found`);
		}

		return this.tagsRepo.findByBoard(boardId);
	}

	async createTag(boardId: string, dto: CreateTagDto): Promise<TagEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);

		const event = this.eventsRepo(em).append(
			board,
			EventType.TagAdded,
			ACTOR
		);
		let tag: TagEntity;

		try {
			tag = em.create(TagEntity, {
				board,
				name: dto.name,
				description: normalizeOptionalText(dto.description),
				prompt: normalizeOptionalText(dto.prompt),
				color: normalizeOptionalText(dto.color),
			});

			// tag.id only exists after the first flush, so the payload is
			// filled in a second one, mirroring createColumn
			await em.persist(tag).flush();
			event.payload = { ...TagResponse.from(tag) };
			await em.flush();
		} catch (error) {
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(
					`A tag named '${dto.name}' already exists on this board`
				);
			}

			throw error;
		}

		this.events.publish([EventResponse.from(event)]);

		return tag;
	}

	async updateTag(
		boardId: string,
		tagId: number,
		dto: UpdateTagDto
	): Promise<TagEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const tag = await this.loadTag(em, boardId, tagId);

		if (dto.name !== undefined) {
			tag.name = dto.name;
		}
		if (dto.description !== undefined) {
			tag.description = normalizeOptionalText(dto.description);
		}
		if (dto.prompt !== undefined) {
			tag.prompt = normalizeOptionalText(dto.prompt);
		}
		if (dto.color !== undefined) {
			tag.color = normalizeOptionalText(dto.color);
		}

		try {
			// Flush the tag change first so a duplicate name is caught and the
			// onUpdate timestamp is fresh before the event payload is built
			await em.flush();
		} catch (error) {
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(
					`A tag named '${dto.name}' already exists on this board`
				);
			}

			throw error;
		}

		const event = this.eventsRepo(em).append(
			board,
			EventType.TagUpdated,
			ACTOR,
			{ ...TagResponse.from(tag) }
		);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return tag;
	}

	async deleteTag(boardId: string, tagId: number): Promise<void> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const tag = await this.loadTag(em, boardId, tagId);

		const event = this.eventsRepo(em).append(
			board,
			EventType.TagDeleted,
			ACTOR,
			{ id: tag.id, name: tag.name }
		);

		await em.remove(tag).flush();
		this.events.publish([EventResponse.from(event)]);
	}

	async reorderColumns(boardId: string, columnIds: number[]) {
		if (!(await this.boardExists(boardId))) {
			throw new NotFoundException(`Board '${boardId}' not found`);
		}

		let columns: ColumnEntity[];

		try {
			columns = await this.columnsRepo.reorder(boardId, columnIds);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("orderedIds")
			) {
				throw new BadRequestException(error.message);
			}

			throw error;
		}

		const board = await this.boardsRepo.findWithColumns(boardId);
		await this.recordEvent(
			board,
			EventType.ColumnReordered,
			{ columns: columns.map((column) => ColumnResponse.from(column)) }
		);

		return columns;
	}

	async createTask(
		boardId: string,
		columnId: number,
		dto: CreateTaskDto
	): Promise<TaskEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const column = await this.loadColumn(em, boardId, columnId);
		const tags = await this.resolveTags(em, boardId, dto.tagIds);
		// A brand-new task has no id yet, so it cannot be part of a cycle
		const dependsOn = await this.resolveDependencies(
			em,
			boardId,
			null,
			dto.dependsOn
		);

		const event = this.eventsRepo(em).append(
			board,
			EventType.TaskCreated,
			ACTOR
		);
		const task = em.create(TaskEntity, {
			column,
			name: dto.name,
			description: dto.description ?? "",
			position: await this.nextTaskPosition(em, columnId),
			priority: dto.priority ?? null,
			estimate: dto.estimate ?? null,
			assignee: normalizeOptionalText(dto.assignee),
			dueAt: parseDueAt(dto.dueAt),
		});
		task.tags.set(tags);
		task.dependsOn.set(dependsOn);

		// task.id only exists after the first flush, so the payload is filled
		// in a second one, mirroring createColumn
		await em.persist(task).flush();
		event.payload = { ...TaskResponse.from(task) };
		await em.flush();

		this.events.publish([EventResponse.from(event)]);

		return task;
	}

	async updateTask(
		boardId: string,
		columnId: number,
		taskId: number,
		dto: UpdateTaskDto
	): Promise<TaskEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const task = await this.loadTaskInColumn(em, columnId, taskId, true);

		if (dto.name !== undefined) {
			task.name = dto.name;
		}
		if (dto.description !== undefined) {
			task.description = dto.description;
		}
		if (dto.priority !== undefined) {
			task.priority = dto.priority;
		}
		if (dto.estimate !== undefined) {
			task.estimate = dto.estimate;
		}
		if (dto.assignee !== undefined) {
			task.assignee = normalizeOptionalText(dto.assignee);
		}
		if (dto.dueAt !== undefined) {
			task.dueAt = parseDueAt(dto.dueAt);
		}
		if (dto.tagIds !== undefined) {
			task.tags.set(await this.resolveTags(em, boardId, dto.tagIds));
		}
		if (dto.dependsOn !== undefined) {
			task.dependsOn.set(
				await this.resolveDependencies(em, boardId, taskId, dto.dependsOn)
			);
		}

		// Flush before building the payload so onUpdate has refreshed
		// task.updatedAt, then persist the event in a second flush
		await em.flush();

		const event = this.eventsRepo(em).append(
			board,
			EventType.TaskUpdated,
			ACTOR,
			{ ...TaskResponse.from(task) }
		);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return task;
	}

	async deleteTask(
		boardId: string,
		columnId: number,
		taskId: number
	): Promise<void> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const task = await this.loadTaskInColumn(em, columnId, taskId);

		const event = this.eventsRepo(em).append(
			board,
			EventType.TaskDeleted,
			ACTOR,
			{ id: task.id, name: task.name, columnId }
		);

		await em.remove(task).flush();
		this.events.publish([EventResponse.from(event)]);
	}

	// A single move handles both a within-column reposition and a
	// cross-column transfer: rebuild the source and target orderings, then
	// write one task.moved event
	async moveTask(
		boardId: string,
		taskId: number,
		dto: MoveTaskDto
	): Promise<TaskEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const task = await this.loadTask(em, boardId, taskId, true);
		const targetColumn = await this.loadColumn(em, boardId, dto.columnId);
		const sourceColumnId = (task.column as ColumnEntity).id as number;

		// The moved task is excluded from the surviving orderings
		const sourceTasks = (await this.tasksOf(em, sourceColumnId)).filter(
			(candidate) => (candidate.id as number) !== task.id
		);
		const targetTasks = (await this.tasksOf(em, targetColumn.id as number)).filter(
			(candidate) => (candidate.id as number) !== task.id
		);

		const insertAt =
			dto.position === undefined
				? targetTasks.length
				: Math.max(0, Math.min(dto.position, targetTasks.length));

		task.column = targetColumn;
		targetTasks.splice(insertAt, 0, task);

		for (const [position, candidate] of sourceTasks.entries()) {
			candidate.position = position;
		}
		for (const [position, candidate] of targetTasks.entries()) {
			candidate.position = position;
		}

		// Flush first so onUpdate refreshes task.updatedAt before the payload
		await em.flush();

		const event = this.eventsRepo(em).append(board, EventType.TaskMoved, ACTOR, {
			...TaskResponse.from(task),
		});

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return task;
	}

	async claimTask(
		boardId: string,
		columnId: number,
		taskId: number,
		actor?: string
	): Promise<TaskEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const column = await this.loadColumn(em, boardId, columnId);
		const task = await this.loadTaskInColumn(em, columnId, taskId, true);

		if (!column.isQueue) {
			throw new BadRequestException(
				`Column '${column.name}' is not a queue`
			);
		}
		if (task.claimedBy) {
			throw new ConflictException(`Task '${taskId}' is already claimed`);
		}

		const claimer = actor ?? ACTOR;
		task.claimedBy = claimer;

		await em.flush();

		const event = this.eventsRepo(em).append(
			board,
			EventType.TaskClaimed,
			claimer,
			{ ...TaskResponse.from(task) }
		);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return task;
	}

	async releaseTask(
		boardId: string,
		columnId: number,
		taskId: number
	): Promise<TaskEntity> {
		const em = this.em.fork();
		const board = await this.loadBoard(em, boardId);
		const task = await this.loadTaskInColumn(em, columnId, taskId, true);

		if (!task.claimedBy) {
			throw new ConflictException(`Task '${taskId}' is not claimed`);
		}

		task.claimedBy = "";

		await em.flush();

		const event = this.eventsRepo(em).append(
			board,
			EventType.TaskReleased,
			ACTOR,
			{ ...TaskResponse.from(task) }
		);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);

		return task;
	}

	async boardExists(id: string) {
		const count = await this.boardsRepo.count({ id });
		return !!count;
	}

	// Persists an event for a board that already exists, on its own fork so the
	// event's seq is written in a single flush. Publish happens after the flush
	// because the SSE id is the seq, which only exists then.
	private async recordEvent(
		board: BoardEntity,
		type: EventType,
		payload: Record<string, unknown>
	): Promise<void> {
		const em = this.em.fork();
		const event = this.eventsRepo(em).append(board, type, ACTOR, payload);

		await em.flush();
		this.events.publish([EventResponse.from(event)]);
	}

	private eventsRepo(em: EntityManager): EventRepository {
		return em.getRepository(EventEntity) as EventRepository;
	}

	private async loadBoard(
		em: EntityManager,
		id: string
	): Promise<BoardEntity> {
		const board = await em.findOne(BoardEntity, { id }, {
			populate: ["columns"],
		});

		if (!board) {
			throw new NotFoundException(`Board '${id}' not found`);
		}

		return board;
	}

	private async loadColumn(
		em: EntityManager,
		boardId: string,
		columnId: number,
		includeTasks = false
	): Promise<ColumnEntity> {
		const column = includeTasks
			? await em.findOne(
					ColumnEntity,
					{ id: columnId, board: boardId },
					{ populate: ["tasks", "tasks.tags", "tasks.dependsOn", "tasks.dependents"] }
				)
			: await em.findOne(ColumnEntity, { id: columnId, board: boardId });

		if (!column) {
			throw new NotFoundException(
				`Column '${columnId}' not found on board '${boardId}'`
			);
		}

		return column;
	}

	private async nextPosition(em: EntityManager, boardId: string): Promise<number> {
		const [last] = await em.find(
			ColumnEntity,
			{ board: boardId },
			{ orderBy: { position: "desc" }, limit: 1 }
		);

		return last ? last.position + 1 : 0;
	}

	private async tasksOf(
		em: EntityManager,
		columnId: number
	): Promise<TaskEntity[]> {
		return em.find(
			TaskEntity,
			{ column: columnId },
			{ orderBy: { position: "asc", id: "asc" } }
		);
	}

	private async nextTaskPosition(
		em: EntityManager,
		columnId: number
	): Promise<number> {
		const [last] = await em.find(
			TaskEntity,
			{ column: columnId },
			{ orderBy: { position: "desc" }, limit: 1 }
		);

		return last ? last.position + 1 : 0;
	}

	private async loadTaskInColumn(
		em: EntityManager,
		columnId: number,
		taskId: number,
		includeRelations = false
	): Promise<TaskEntity> {
		const task = includeRelations
			? await em.findOne(
					TaskEntity,
					{ id: taskId, column: columnId },
					{ populate: ["tags", "dependsOn", "dependents"] }
				)
			: await em.findOne(TaskEntity, { id: taskId, column: columnId });

		if (!task) {
			throw new NotFoundException(
				`Task '${taskId}' not found in column '${columnId}'`
			);
		}

		return task;
	}

	// Loads by id, then verifies the task's column belongs to the board
	// (loadColumn throws 404 otherwise), so a task from another board is a 404
	private async loadTask(
		em: EntityManager,
		boardId: string,
		taskId: number,
		includeRelations = false
	): Promise<TaskEntity> {
		const task = includeRelations
			? await em.findOne(
					TaskEntity,
					{ id: taskId },
					{ populate: ["tags", "dependsOn", "dependents"] }
				)
			: await em.findOne(TaskEntity, { id: taskId });

		if (!task) {
			throw new NotFoundException(`Task '${taskId}' not found`);
		}

		await this.loadColumn(em, boardId, (task.column as ColumnEntity).id as number);

		return task;
	}

	private async loadTag(
		em: EntityManager,
		boardId: string,
		tagId: number
	): Promise<TagEntity> {
		const tag = await em.findOne(TagEntity, { id: tagId, board: boardId });

		if (!tag) {
			throw new NotFoundException(
				`Tag '${tagId}' not found on board '${boardId}'`
			);
		}

		return tag;
	}

	// Resolves the requested tag ids against the board, rejecting ids that do
	// not belong to it (or do not exist) so a task cannot borrow another
	// board's tags
	private async resolveTags(
		em: EntityManager,
		boardId: string,
		tagIds: number[] | undefined
	): Promise<TagEntity[]> {
		if (!tagIds || tagIds.length === 0) {
			return [];
		}

		const unique = [...new Set(tagIds)];
		const tags = await em.find(TagEntity, {
			id: { $in: unique },
			board: boardId,
		});

		if (tags.length !== unique.length) {
			const found = new Set(tags.map((tag) => tag.id as number));
			const missing = unique.filter((id) => !found.has(id));

			throw new NotFoundException(
				`Tag(s) not found on board '${boardId}': ${missing.join(", ")}`
			);
		}

		return tags;
	}

	// Resolves dependency ids against the board, rejecting ids that do not
	// belong to it, a self-reference, and any edge that would create a cycle
	// (`selfId` already reachable through the requested tasks' dependents).
	private async resolveDependencies(
		em: EntityManager,
		boardId: string,
		selfId: number | null,
		taskIds: number[] | undefined
	): Promise<TaskEntity[]> {
		if (!taskIds || taskIds.length === 0) {
			return [];
		}

		const unique = [...new Set(taskIds)];

		if (selfId !== null && unique.includes(selfId)) {
			throw new BadRequestException(
				`Task '${selfId}' cannot depend on itself`
			);
		}

		const tasks = await em.find(TaskEntity, {
			id: { $in: unique },
			column: { board: boardId },
		});

		if (tasks.length !== unique.length) {
			const found = new Set(tasks.map((task) => task.id as number));
			const missing = unique.filter((id) => !found.has(id));

			throw new NotFoundException(
				`Task(s) not found on board '${boardId}': ${missing.join(", ")}`
			);
		}

		if (selfId !== null && (await this.wouldCreateCycle(em, boardId, selfId, unique))) {
			throw new BadRequestException(
				"Dependency would create a cycle"
			);
		}

		return tasks;
	}

	// `selfId` would depend on each target; that closes a cycle when a target
	// already depends (directly or transitively) on `selfId`. So follow each
	// target's own `dependsOn` chain and look for `selfId`. The board is small,
	// so the whole dependency graph is loaded once and traversed in memory.
	private async wouldCreateCycle(
		em: EntityManager,
		boardId: string,
		selfId: number,
		targetIds: number[]
	): Promise<boolean> {
		const tasks = await em.find(
			TaskEntity,
			{ column: { board: boardId } },
			{ populate: ["dependsOn"] }
		);
		const dependsOf = new Map<number, number[]>();

		for (const task of tasks) {
			dependsOf.set(
				task.id as number,
				task.dependsOn.isInitialized()
					? task.dependsOn.getItems().map((t) => t.id as number)
					: []
			);
		}

		const visited = new Set<number>();
		const stack = [...targetIds];

		while (stack.length > 0) {
			const current = stack.pop() as number;
			if (current === selfId) return true;
			if (visited.has(current)) continue;
			visited.add(current);

			for (const next of dependsOf.get(current) ?? []) {
				stack.push(next);
			}
		}

		return false;
	}
}

function normalizeOptionalText(value: string | null | undefined): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const trimmed = value.trim();

	return trimmed === "" ? null : trimmed;
}

function parseDueAt(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	return new Date(value);
}
