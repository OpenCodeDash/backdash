import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { ColumnEntity } from "../entity/column.entity.js";

@ApiSchema({ name: "Column" })
export class ColumnResponse {
	@ApiProperty({
		type: "integer",
	})
	id: number;

	@ApiProperty({
		type: String,
	})
	name: string;

	@ApiProperty({
		type: "integer",
	})
	position: number;

	@ApiProperty({
		type: Boolean,
	})
	isQueue: boolean;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	pushDescription: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	pullDescription: string | null;

	static from(column: ColumnEntity): ColumnResponse {
		return {
			id: column.id,
			name: column.name,
			position: column.position,
			isQueue: column.isQueue,
			pushDescription: column.pushDescription || null,
			pullDescription: column.pullDescription || null,
		};
	}
}
