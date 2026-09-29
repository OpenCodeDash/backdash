import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { EventEntity } from "../entity/event.entity.js";
import { EventType } from "../enum/event-type.enum.js";

@ApiSchema({ name: "Event" })
export class EventResponse {
	@ApiProperty({
		type: Number,
		description: "Monotonic event id, also sent as the SSE id / Last-Event-ID",
	})
	seq: number;

	@ApiProperty({
		type: String,
		minLength: 6,
		maxLength: 6,
	})
	boardId: string;

	@ApiProperty({
		enum: EventType,
		enumName: "EventType",
	})
	type: EventType;

	@ApiProperty({
		type: String,
		description: 'Agent id, "dashboard" for human actions, or "system"',
	})
	actor: string;

	@ApiProperty({
		type: "object",
		additionalProperties: true,
		description: "Response DTO of whatever changed; shape depends on type",
	})
	payload: Record<string, unknown>;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	createdAt: string;

	static from(event: EventEntity): EventResponse {
		return {
			seq: event.seq,
			boardId: event.board.id,
			type: event.type,
			actor: event.actor,
			payload: event.payload,
			createdAt: event.createdAt.toISOString(),
		};
	}
}
