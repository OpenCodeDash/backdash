import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsInt } from "class-validator";

@ApiSchema({ name: "ReorderColumnsDto" })
export class ReorderColumnsDto {
	@ApiProperty({
		type: [Number],
		description:
			"Every column id on the board, in the desired left-to-right order",
		example: [3, 1, 2],
	})
	@ArrayNotEmpty()
	@ArrayUnique()
	@IsInt({ each: true })
	columnIds: number[];
}
