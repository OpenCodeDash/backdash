import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { BoardEntity } from "../entity/board.entity.js";

@ApiSchema({ name: "BoardSummary" })
export class BoardSummaryResponse {
	@ApiProperty({
		type: String,
		minLength: 6,
		maxLength: 6,
	})
	id: string;

	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 200,
	})
	name: string;

	static from(board: BoardEntity): BoardSummaryResponse {
		return {
			id: board.id,
			name: board.name,
		};
	}
}
