import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 100,
		description: "Unique account name; used as the actor on events and tasks",
	})
	name: string;

	@IsString()
	@MinLength(8)
	@MaxLength(200)
	@ApiProperty({
		type: String,
		minLength: 8,
		maxLength: 200,
	})
	password: string;
}
