import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { KanbanService } from "./kanban.service.js";
import { CreateBoardDto } from "./dto/create-board.dto.js";
import {
	ApiCreatedResponse,
	ApiOkResponse,
	ApiOperation,
} from "@nestjs/swagger";
import { BoardResponse } from "./response/board-detail.response.js";
import { BoardSummaryResponse } from "./response/board-summary.response.js";
import { ReorderColumnsDto } from "./dto/reorder-columns.dto.js";
import { ColumnResponse } from "./response/column.response.js";

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
	async getBoard(@Param("id") id: string): Promise<BoardResponse> {
		const board = await this.kanbanService.getBoard(id);
		return BoardResponse.from(board);
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
}
