import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsInt,
	IsISO8601,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { TaskPriority } from "../enum/task-priority.enum.js";
import { TaskTodoDto } from "./task-todo.dto.js";

export class CreateTaskDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 100,
	})
	name: string;

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
		description: "Story-point estimate",
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
	})
	assignee?: string | null;

	@IsOptional()
	@IsISO8601()
	@ApiProperty({
		type: String,
		format: "date-time",
		required: false,
		nullable: true,
		description: "ISO-8601 date or date-time (date normalises to UTC midnight)",
	})
	dueAt?: string | null;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@ApiProperty({
		type: [Number],
		required: false,
		description: "Tags (by id) to attach; must belong to the same board",
	})
	tagIds?: number[];

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@ApiProperty({
		type: [Number],
		required: false,
		description: "Tasks (by id) this task depends on; must belong to the same board",
	})
	dependsOn?: number[];

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => TaskTodoDto)
	@ApiProperty({
		type: [TaskTodoDto],
		required: false,
		description: "Initial checklist for the task",
	})
	todos?: TaskTodoDto[];
}
