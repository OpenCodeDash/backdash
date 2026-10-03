import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ClaimTaskDto {
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		required: false,
		description:
			"Opencode session claiming the task; links the task to that session so the dashboard can resolve it back",
	})
	sessionId?: string;
}
