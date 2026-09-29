import type { Opt, Rel } from "@mikro-orm/core";
import {
	Entity,
	Index,
	ManyToOne,
	PrimaryKey,
	Property,
	Unique,
} from "@mikro-orm/decorators/legacy";
import { BoardEntity } from "./board.entity.js";
import { ColumnRepository } from "../repository/column.repository.js";

@Entity({
	tableName: "columns",
	repository: () => ColumnRepository,
})
@Unique({ properties: ["board", "name"] })
@Index({ properties: ["board", "position"] })
export class ColumnEntity {
	@PrimaryKey({
		type: "integer",
	})
	id: Opt<number>;

	@ManyToOne(() => BoardEntity, {
		deleteRule: "cascade",
	})
	board: Rel<BoardEntity>;

	@Property({
		type: "text",
		length: 100,
	})
	name: string;

	@Property({
		type: "integer",
	})
	position: number;

	@Property({
		type: "boolean",
	})
	isQueue: Opt<boolean> = false;

	@Property({
		type: "text",
	})
	pushDescription: Opt<string> = "";

	@Property({
		type: "text",
	})
	pullDescription: Opt<string> = "";
}
