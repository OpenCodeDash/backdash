import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { TaskEntity } from "../entity/task.entity.js";
import { ColumnEntity } from "../entity/column.entity.js";
import { TagResponse } from "./tag.response.js";
import { TaskPriority } from "../enum/task-priority.enum.js";

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

	@ApiProperty({
		type: String,
		enum: TaskPriority,
		nullable: true,
	})
	priority: TaskPriority | null;

	@ApiProperty({
		type: "integer",
		nullable: true,
		description: "Story-point estimate",
	})
	estimate: number | null;

	@ApiProperty({
		type: String,
		nullable: true,
		description: "Owner set before/independent of an agent claim",
	})
	assignee: string | null;

	@ApiProperty({
		type: String,
		format: "date-time",
		nullable: true,
	})
	dueAt: string | null;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	createdAt: string;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	updatedAt: string;

	@ApiProperty({
		type: [TagResponse],
		description: "Board tags attached to the task",
	})
	tags: TagResponse[];

	static from(task: TaskEntity): TaskResponse {
		// Mutation paths populate tags; an uninitialised collection would be a
		// bug here, so the empty fallback only guards relation loads we missed
		const tags = task.tags.isInitialized()
			? task.tags
					.getItems()
					.map((tag) => TagResponse.from(tag))
					.sort((a, b) => a.name.localeCompare(b.name))
			: [];

		return {
			id: task.id,
			columnId: (task.column as ColumnEntity).id as number,
			name: task.name,
			description: task.description || null,
			position: task.position,
			claimedBy: task.claimedBy || null,
			priority: task.priority ?? null,
			estimate: task.estimate ?? null,
			assignee: task.assignee ?? null,
			dueAt: task.dueAt ? task.dueAt.toISOString() : null,
			createdAt: task.createdAt.toISOString(),
			updatedAt: task.updatedAt.toISOString(),
			tags,
		};
	}
}
