import { IsInt, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class MoveTaskDto {
	@IsInt()
	@ApiProperty({
		type: "integer",
		description: "Destination column id on the board",
	})
	columnId: number;

	@IsOptional()
	@IsInt()
	@ApiProperty({
		type: "integer",
		required: false,
		description:
			"Zero-based index in the destination column; omit to append at the end",
	})
	position?: number;
}
