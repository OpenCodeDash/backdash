import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateServiceAccountDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 100,
		description:
			"Unique name for the service account; agents claim tasks as this name",
	})
	name: string;
}
