import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateColumnDto {
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
	@IsBoolean()
	@ApiProperty({
		type: Boolean,
		required: false,
		default: false,
		description: "Whether agents may claim tasks from this column",
	})
	isQueue?: boolean;
}
