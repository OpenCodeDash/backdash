import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { BoardEntity } from "../entity/board.entity.js";
import { BoardSummaryResponse } from "./board-summary.response.js";
import { ColumnResponse } from "./column.response.js";
import { TagResponse } from "./tag.response.js";

@ApiSchema({ name: "BoardDetail" })
export class BoardResponse extends BoardSummaryResponse {
	@ApiProperty({
		type: [ColumnResponse],
		description: "Columns in board order, left to right",
	})
	columns: ColumnResponse[];

	@ApiProperty({
		type: [TagResponse],
		description: "Tags defined on the board, alphabetical",
	})
	tags: TagResponse[];

	static from(board: BoardEntity): BoardResponse {
		if (!board.columns.isInitialized()) {
			throw new Error(
				"BoardDetailResponse requires board.columns to be populated"
			);
		}

		return {
			...BoardSummaryResponse.from(board),
			columns: board.columns.map((column) => ColumnResponse.from(column)),
			tags: board.tags.isInitialized()
				? board.tags.map((tag) => TagResponse.from(tag))
				: [],
		};
	}
}
