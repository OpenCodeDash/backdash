import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateColumnDto {
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
	@IsBoolean()
	@ApiProperty({
		type: Boolean,
		required: false,
		description: "Whether agents may claim tasks from this column",
	})
	isQueue?: boolean;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		description: "Prompt text agents receive when pushing a task here",
	})
	pushDescription?: string;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		description: "Prompt text agents receive when pulling a task from here",
	})
	pullDescription?: string;
}
