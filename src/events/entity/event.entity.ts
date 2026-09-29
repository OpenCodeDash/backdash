import type { Opt, Rel } from "@mikro-orm/core";
import {
	Entity,
	Index,
	ManyToOne,
	PrimaryKey,
	Property,
} from "@mikro-orm/decorators/legacy";
import { EventRepository } from "../repository/event.repository.js";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { EventType } from "../enum/event-type.enum.js";

@Entity({
	tableName: "events",
	repository: () => EventRepository,
})
@Index({ properties: ["board", "seq"] })
export class EventEntity {
	@PrimaryKey({
		type: "integer",
		autoincrement: true,
	})
	seq: Opt<number>;

	@ManyToOne(() => BoardEntity, {
		deleteRule: "cascade",
	})
	board: Rel<BoardEntity>;

	@Property({
		type: "text",
		length: 50,
	})
	type: EventType;

	@Property({
		type: "text",
		length: 100,
	})
	actor: string;

	@Property({
		type: "json",
	})
	payload: Record<string, unknown>;

	@Property({
		type: "datetime",
	})
	createdAt: Opt<Date> = new Date();
}
