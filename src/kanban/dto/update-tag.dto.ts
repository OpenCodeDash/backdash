import {
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateTagDto {
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	@ApiProperty({
		type: String,
		required: false,
		minLength: 1,
		maxLength: 50,
	})
	name?: string;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		description: "null clears the description",
	})
	description?: string | null;

	@IsOptional()
	@IsString()
	@ApiProperty({
		type: String,
		required: false,
		nullable: true,
		description: "null clears the prompt",
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
		description: "null clears the color",
	})
	color?: string | null;
}
