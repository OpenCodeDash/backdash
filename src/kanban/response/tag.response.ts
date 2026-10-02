import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { TagEntity } from "../entity/tag.entity.js";

@ApiSchema({ name: "Tag" })
export class TagResponse {
	@ApiProperty({
		type: "integer",
	})
	id: number;

	@ApiProperty({
		type: String,
	})
	name: string;

	@ApiProperty({
		type: String,
		nullable: true,
		description: "What the tag means to a human reader",
	})
	description: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
		description: "Instructions injected when an agent runs a task with this tag",
	})
	prompt: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
	})
	color: string | null;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	createdAt: string;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	updatedAt: string;

	static from(tag: TagEntity): TagResponse {
		return {
			id: tag.id,
			name: tag.name,
			description: tag.description ?? null,
			prompt: tag.prompt ?? null,
			color: tag.color ?? null,
			createdAt: tag.createdAt.toISOString(),
			updatedAt: tag.updatedAt.toISOString(),
		};
	}
}
