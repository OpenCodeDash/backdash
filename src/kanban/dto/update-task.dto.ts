import {
	IsArray,
	IsEnum,
	IsInt,
	IsISO8601,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { TaskPriority } from "../enum/task-priority.enum.js";

export class UpdateTaskDto {
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		required: false,
		minLength: 1,
		maxLength: 100,
	})
	name?: string;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		description: "Prompt text the task carries",
	})
	description?: string;

	@IsOptional()
	@IsEnum(TaskPriority)
	@ApiProperty({
		enum: TaskPriority,
		required: false,
		nullable: true,
		description: "null clears the priority",
	})
	priority?: TaskPriority | null;

	@IsOptional()
	@IsInt()
	@Min(0)
	@ApiProperty({
		type: "integer",
		required: false,
		nullable: true,
		minimum: 0,
		description: "Story-point estimate; null clears it",
	})
	estimate?: number | null;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		maxLength: 100,
		description: "null clears the assignee",
	})
	assignee?: string | null;

	@IsOptional()
	@IsISO8601()
	@ApiProperty({
		type: String,
		format: "date-time",
		required: false,
		nullable: true,
		description:
			"ISO-8601 date or date-time (date normalises to UTC midnight); null clears it",
	})
	dueAt?: string | null;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@ApiProperty({
		type: [Number],
		required: false,
		description: "Replaces the task's tags with this exact set of tag ids",
	})
	tagIds?: number[];
}
