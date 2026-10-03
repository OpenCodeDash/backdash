import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 100,
	})
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 200,
	})
	password: string;
}
