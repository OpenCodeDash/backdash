import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
} from "@nestjs/common";
import { KanbanService } from "./kanban.service.js";
import { CreateBoardDto } from "./dto/create-board.dto.js";
import { RenameBoardDto } from "./dto/rename-board.dto.js";
import { CreateColumnDto } from "./dto/create-column.dto.js";
import { UpdateColumnDto } from "./dto/update-column.dto.js";
import { CreateTaskDto } from "./dto/create-task.dto.js";
import { UpdateTaskDto } from "./dto/update-task.dto.js";
import { CreateTagDto } from "./dto/create-tag.dto.js";
import { UpdateTagDto } from "./dto/update-tag.dto.js";
import { MoveTaskDto } from "./dto/move-task.dto.js";
import { ClaimTaskDto } from "./dto/claim-task.dto.js";
import {
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
} from "@nestjs/swagger";
import { BoardResponse } from "./response/board-detail.response.js";
import { BoardSummaryResponse } from "./response/board-summary.response.js";
import { ReorderColumnsDto } from "./dto/reorder-columns.dto.js";
import { ColumnResponse } from "./response/column.response.js";
import { TaskResponse } from "./response/task.response.js";
import { TagResponse } from "./response/tag.response.js";

@Controller("kanban")
export class KanbanController {
	constructor(private readonly kanbanService: KanbanService) {}

	@Post()
	@ApiOperation({ operationId: "createBoard" })
	@ApiCreatedResponse({
		type: BoardResponse,
	})
	async createBoard(@Body() dto: CreateBoardDto): Promise<BoardResponse> {
		const board = await this.kanbanService.createBoard(dto.name);
		return BoardResponse.from(board);
	}

	@Get()
	@ApiOperation({ operationId: "getAllBoards" })
	@ApiOkResponse({
		type: [BoardSummaryResponse],
	})
	async getAllBoards(): Promise<BoardSummaryResponse[]> {
		const boards = await this.kanbanService.all();
		return boards.map((board) => BoardSummaryResponse.from(board));
	}

	@Get(":id")
	@ApiOperation({ operationId: "getBoard" })
	@ApiOkResponse({
		type: BoardResponse,
	})
	@ApiNotFoundResponse({ description: "Board not found" })
	async getBoard(@Param("id") id: string): Promise<BoardResponse> {
		const board = await this.kanbanService.getBoard(id);
		return BoardResponse.from(board);
	}

	@Put(":id")
	@ApiOperation({ operationId: "renameBoard" })
	@ApiOkResponse({
		type: BoardResponse,
	})
	@ApiNotFoundResponse({ description: "Board not found" })
	async renameBoard(
		@Param("id") id: string,
		@Body() dto: RenameBoardDto
	): Promise<BoardResponse> {
		const board = await this.kanbanService.renameBoard(id, dto.name);
		return BoardResponse.from(board);
	}

	@Delete(":id")
	@HttpCode(204)
	@ApiOperation({ operationId: "deleteBoard" })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: "Board not found" })
	async deleteBoard(@Param("id") id: string): Promise<void> {
		await this.kanbanService.deleteBoard(id);
	}

	@Put(":boardId/columns/order")
	@ApiOperation({ operationId: "reorderBoardColumns" })
	@ApiOkResponse({
		type: [ColumnResponse],
	})
	async reorder(
		@Param("boardId") boardId: string,
		@Body() dto: ReorderColumnsDto
	) {
		const columns = await this.kanbanService.reorderColumns(
			boardId,
			dto.columnIds
		);

		return columns.map((column) => ColumnResponse.from(column));
	}

	@Post(":boardId/columns")
	@ApiOperation({ operationId: "createColumn" })
	@ApiCreatedResponse({
		type: ColumnResponse,
	})
	@ApiConflictResponse({
		description: "A column with this name already exists on the board",
	})
	@ApiNotFoundResponse({ description: "Board not found" })
	async createColumn(
		@Param("boardId") boardId: string,
		@Body() dto: CreateColumnDto
	): Promise<ColumnResponse> {
		const column = await this.kanbanService.createColumn(
			boardId,
			dto.name,
			dto.isQueue
		);
		return ColumnResponse.from(column);
	}

	@Put(":boardId/columns/:columnId")
	@ApiOperation({ operationId: "updateColumn" })
	@ApiOkResponse({
		type: ColumnResponse,
	})
	@ApiConflictResponse({
		description: "A column with this name already exists on the board",
	})
	@ApiNotFoundResponse({ description: "Board or column not found" })
	async updateColumn(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Body() dto: UpdateColumnDto
	): Promise<ColumnResponse> {
		const column = await this.kanbanService.updateColumn(
			boardId,
			columnId,
			dto
		);
		return ColumnResponse.from(column);
	}

	@Delete(":boardId/columns/:columnId")
	@HttpCode(204)
	@ApiOperation({ operationId: "deleteColumn" })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: "Board or column not found" })
	async deleteColumn(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number
	): Promise<void> {
		await this.kanbanService.deleteColumn(boardId, columnId);
	}

	@Get(":boardId/tags")
	@ApiOperation({ operationId: "listTags" })
	@ApiOkResponse({ type: [TagResponse] })
	@ApiNotFoundResponse({ description: "Board not found" })
	async listTags(
		@Param("boardId") boardId: string
	): Promise<TagResponse[]> {
		const tags = await this.kanbanService.listTags(boardId);
		return tags.map((tag) => TagResponse.from(tag));
	}

	@Post(":boardId/tags")
	@ApiOperation({ operationId: "createTag" })
	@ApiCreatedResponse({ type: TagResponse })
	@ApiConflictResponse({
		description: "A tag with this name already exists on the board",
	})
	@ApiNotFoundResponse({ description: "Board not found" })
	async createTag(
		@Param("boardId") boardId: string,
		@Body() dto: CreateTagDto
	): Promise<TagResponse> {
		const tag = await this.kanbanService.createTag(boardId, dto);
		return TagResponse.from(tag);
	}

	@Put(":boardId/tags/:tagId")
	@ApiOperation({ operationId: "updateTag" })
	@ApiOkResponse({ type: TagResponse })
	@ApiConflictResponse({
		description: "A tag with this name already exists on the board",
	})
	@ApiNotFoundResponse({ description: "Board or tag not found" })
	async updateTag(
		@Param("boardId") boardId: string,
		@Param("tagId", ParseIntPipe) tagId: number,
		@Body() dto: UpdateTagDto
	): Promise<TagResponse> {
		const tag = await this.kanbanService.updateTag(boardId, tagId, dto);
		return TagResponse.from(tag);
	}

	@Delete(":boardId/tags/:tagId")
	@HttpCode(204)
	@ApiOperation({ operationId: "deleteTag" })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: "Board or tag not found" })
	async deleteTag(
		@Param("boardId") boardId: string,
		@Param("tagId", ParseIntPipe) tagId: number
	): Promise<void> {
		await this.kanbanService.deleteTag(boardId, tagId);
	}

	@Post(":boardId/columns/:columnId/tasks")
	@ApiOperation({ operationId: "createTask" })
	@ApiCreatedResponse({ type: TaskResponse })
	@ApiNotFoundResponse({ description: "Board or column not found" })
	async createTask(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Body() dto: CreateTaskDto
	): Promise<TaskResponse> {
		const task = await this.kanbanService.createTask(boardId, columnId, dto);
		return TaskResponse.from(task);
	}

	@Put(":boardId/columns/:columnId/tasks/:taskId")
	@ApiOperation({ operationId: "updateTask" })
	@ApiOkResponse({ type: TaskResponse })
	@ApiNotFoundResponse({ description: "Board or task not found" })
	async updateTask(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Param("taskId", ParseIntPipe) taskId: number,
		@Body() dto: UpdateTaskDto
	): Promise<TaskResponse> {
		const task = await this.kanbanService.updateTask(
			boardId,
			columnId,
			taskId,
			dto
		);
		return TaskResponse.from(task);
	}

	@Delete(":boardId/columns/:columnId/tasks/:taskId")
	@HttpCode(204)
	@ApiOperation({ operationId: "deleteTask" })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: "Board or task not found" })
	async deleteTask(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Param("taskId", ParseIntPipe) taskId: number
	): Promise<void> {
		await this.kanbanService.deleteTask(boardId, columnId, taskId);
	}

	@Post(":boardId/tasks/:taskId/move")
	@HttpCode(200)
	@ApiOperation({ operationId: "moveTask" })
	@ApiOkResponse({ type: TaskResponse })
	@ApiNotFoundResponse({ description: "Board, task, or column not found" })
	async moveTask(
		@Param("boardId") boardId: string,
		@Param("taskId", ParseIntPipe) taskId: number,
		@Body() dto: MoveTaskDto
	): Promise<TaskResponse> {
		const task = await this.kanbanService.moveTask(boardId, taskId, dto);
		return TaskResponse.from(task);
	}

	@Post(":boardId/columns/:columnId/tasks/:taskId/claim")
	@HttpCode(200)
	@ApiOperation({ operationId: "claimTask" })
	@ApiOkResponse({ type: TaskResponse })
	@ApiNotFoundResponse({ description: "Board or task not found" })
	@ApiConflictResponse({ description: "The task is already claimed" })
	async claimTask(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Param("taskId", ParseIntPipe) taskId: number,
		@Body() dto: ClaimTaskDto
	): Promise<TaskResponse> {
		const task = await this.kanbanService.claimTask(
			boardId,
			columnId,
			taskId,
			dto.actor
		);
		return TaskResponse.from(task);
	}

	@Post(":boardId/columns/:columnId/tasks/:taskId/release")
	@HttpCode(200)
	@ApiOperation({ operationId: "releaseTask" })
	@ApiOkResponse({ type: TaskResponse })
	@ApiNotFoundResponse({ description: "Board or task not found" })
	@ApiConflictResponse({ description: "The task is not claimed" })
	async releaseTask(
		@Param("boardId") boardId: string,
		@Param("columnId", ParseIntPipe) columnId: number,
		@Param("taskId", ParseIntPipe) taskId: number
	): Promise<TaskResponse> {
		const task = await this.kanbanService.releaseTask(boardId, columnId, taskId);
		return TaskResponse.from(task);
	}
}
