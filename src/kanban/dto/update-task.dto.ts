import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

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
}
