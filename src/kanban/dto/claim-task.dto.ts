import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ClaimTaskDto {
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		required: false,
		maxLength: 100,
		description:
			"Who is claiming the task; defaults to the dashboard actor",
	})
	actor?: string;
}
