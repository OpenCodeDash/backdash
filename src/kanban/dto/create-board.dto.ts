import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateBoardDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	@ApiProperty({
		type: String,
		minLength: 1,
		maxLength: 200,
	})
	name: string;
}
