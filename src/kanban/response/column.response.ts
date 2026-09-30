import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { ColumnEntity } from "../entity/column.entity.js";
import { TaskResponse } from "./task.response.js";

@ApiSchema({ name: "Column" })
export class ColumnResponse {
	@ApiProperty({
		type: "integer",
	})
	id: number;

	@ApiProperty({
		type: String,
	})
	name: string;

	@ApiProperty({
		type: "integer",
	})
	position: number;

	@ApiProperty({
		type: Boolean,
	})
	isQueue: boolean;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	pushDescription: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	pullDescription: string | null;

	@ApiProperty({
		type: [TaskResponse],
		description: "Tasks in column order, top to bottom",
	})
	tasks: TaskResponse[];

	static from(column: ColumnEntity): ColumnResponse {
		// Column detail responses (board detail) populate tasks; the
		// column-level mutations return before tasks are loaded, so an
		// uninitialised collection degrades to an empty list
		return {
			id: column.id,
			name: column.name,
			position: column.position,
			isQueue: column.isQueue,
			pushDescription: column.pushDescription || null,
			pullDescription: column.pullDescription || null,
			tasks: column.tasks.isInitialized()
				? column.tasks.map((task) => TaskResponse.from(task))
				: [],
		};
	}
}
