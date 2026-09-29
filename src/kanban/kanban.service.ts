import { InjectRepository } from "@mikro-orm/nestjs";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { BoardEntity } from "./entity/board.entity.js";
import { BoardRepository } from "./repository/board.repository.js";
import { ColumnEntity } from "./entity/column.entity.js";
import { ColumnRepository } from "./repository/column.repository.js";

@Injectable()
export class KanbanService {
	constructor(
		@InjectRepository(BoardEntity)
		private readonly boardsRepo: BoardRepository,
		@InjectRepository(ColumnEntity)
		private readonly columnsRepo: ColumnRepository
	) {}

	createBoard(name: string) {
		return this.boardsRepo.newBoard(name);
	}

	all() {
		return this.boardsRepo.findAll();
	}

	getBoard(id: string) {
		return this.boardsRepo.findWithColumns(id);
	}

	async reorderColumns(boardId: string, columnIds: number[]) {
		if (!(await this.boardExists(boardId))) {
			throw new NotFoundException(`Board '${boardId}' not found`);
		}

		try {
			return await this.columnsRepo.reorder(boardId, columnIds);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("orderedIds")
			) {
				throw new BadRequestException(error.message);
			}

			throw error;
		}
	}

	async boardExists(id: string) {
		const count = await this.boardsRepo.count({ id });
		return !!count;
	}
}
