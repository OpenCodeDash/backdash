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
import { EventsService } from "../events/events.service.js";
import { EventEntity } from "../events/entity/event.entity.js";
import { EventRepository } from "../events/repository/event.repository.js";
import { EventType } from "../events/enum/event-type.enum.js";
import { EventResponse } from "../events/response/event.response.js";
import { BoardResponse } from "./response/board-detail.response.js";
import { ColumnResponse } from "./response/column.response.js";
import { TaskResponse } from "./response/task.response.js";
import { UpdateColumnDto } from "./dto/update-column.dto.js";
import { CreateTaskDto } from "./dto/create-task.dto.js";
import { UpdateTaskDto } from "./dto/update-task.dto.js";
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
		const column = await this.loadColumn(em, boardId, columnId);

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
		});

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
		const task = await this.loadTaskInColumn(em, columnId, taskId);

		if (dto.name !== undefined) {
			task.name = dto.name;
		}
		if (dto.description !== undefined) {
			task.description = dto.description;
		}

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
		const task = await this.loadTask(em, boardId, taskId);
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
		const task = await this.loadTaskInColumn(em, columnId, taskId);

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
		const task = await this.loadTaskInColumn(em, columnId, taskId);

		if (!task.claimedBy) {
			throw new ConflictException(`Task '${taskId}' is not claimed`);
		}

		task.claimedBy = "";

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
		columnId: number
	): Promise<ColumnEntity> {
		const column = await em.findOne(ColumnEntity, { id: columnId, board: boardId });

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
		taskId: number
	): Promise<TaskEntity> {
		const task = await em.findOne(TaskEntity, { id: taskId, column: columnId });

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
		taskId: number
	): Promise<TaskEntity> {
		const task = await em.findOne(TaskEntity, { id: taskId });

		if (!task) {
			throw new NotFoundException(`Task '${taskId}' not found`);
		}

		await this.loadColumn(em, boardId, (task.column as ColumnEntity).id as number);

		return task;
	}
}
