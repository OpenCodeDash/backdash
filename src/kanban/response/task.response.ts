import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { TaskEntity } from "../entity/task.entity.js";
import { ColumnEntity } from "../entity/column.entity.js";

@ApiSchema({ name: "Task" })
export class TaskResponse {
	@ApiProperty({
		type: "integer",
	})
	id: number;

	@ApiProperty({
		type: "integer",
		description: "The column the task currently sits in",
	})
	columnId: number;

	@ApiProperty({
		type: String,
	})
	name: string;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	description: string | null;

	@ApiProperty({
		type: "integer",
	})
	position: number;

	@ApiProperty({
		type: String,
		nullable: true,
		description: "Set while the task is claimed, cleared on release",
	})
	claimedBy: string | null;

	static from(task: TaskEntity): TaskResponse {
		return {
			id: task.id,
			columnId: (task.column as ColumnEntity).id as number,
			name: task.name,
			description: task.description || null,
			position: task.position,
			claimedBy: task.claimedBy || null,
		};
	}
}
