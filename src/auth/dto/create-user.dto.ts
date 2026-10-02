import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateUserDto {
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
	@MinLength(8)
	@MaxLength(200)
	@ApiProperty({
		type: String,
		minLength: 8,
		maxLength: 200,
	})
	password: string;

	@IsOptional()
	@IsBoolean()
	@ApiProperty({
		type: Boolean,
		required: false,
		default: false,
		description: "Grant admin (account-provisioning) rights",
	})
	isAdmin?: boolean;
}
