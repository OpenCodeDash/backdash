import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { TaskTodoStatus } from "../enum/task-todo-status.enum.js";

export class TaskTodoDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(500)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 500,
		description: "The todo item text",
	})
	content: string;

	@IsEnum(TaskTodoStatus)
	@ApiProperty({
		enum: TaskTodoStatus,
		description: "Status of the todo item",
	})
	status: TaskTodoStatus;
}
