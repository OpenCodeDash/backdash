import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { BoardEntity } from "../entity/board.entity.js";
import { TaskEntity } from "../entity/task.entity.js";
import { TaskResponse } from "./task.response.js";

// A task together with the board it lives on. Used by the session lookup, where
// the caller knows a session id but not which board (or column) its task is in.
@ApiSchema({ name: "SessionTask" })
export class SessionTaskResponse {
	@ApiProperty({
		type: String,
		description: "Id of the board the task belongs to",
	})
	boardId: string;

	@ApiProperty({
		type: TaskResponse,
	})
	task: TaskResponse;

	static from(board: BoardEntity, task: TaskEntity): SessionTaskResponse {
		return {
			boardId: board.id,
			task: TaskResponse.from(task),
		};
	}
}
