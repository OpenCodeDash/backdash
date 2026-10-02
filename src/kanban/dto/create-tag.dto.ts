import {
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateTagDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 50,
		description: "Unique within the board",
	})
	name: string;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		description: "What the tag means to a human reader",
	})
	description?: string | null;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		description: "Instructions injected when an agent runs a task with this tag",
	})
	prompt?: string | null;

	@IsOptional()
	@IsString()
	@MaxLength(20)
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		maxLength: 20,
	})
	color?: string | null;
}
