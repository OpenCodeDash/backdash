import type { Opt, Rel } from "@mikro-orm/core";
import {
	Entity,
	Index,
	ManyToOne,
	PrimaryKey,
	Property,
} from "@mikro-orm/decorators/legacy";
import { ColumnEntity } from "./column.entity.js";
import { TaskRepository } from "../repository/task.repository.js";

@Entity({
	tableName: "tasks",
	repository: () => TaskRepository,
})
@Index({ properties: ["column", "position"] })
export class TaskEntity {
	@PrimaryKey({
		type: "integer",
	})
	id: Opt<number>;

	@ManyToOne(() => ColumnEntity, {
		deleteRule: "cascade",
	})
	column: Rel<ColumnEntity>;

	@Property({
		type: "text",
		length: 100,
	})
	name: string;

	@Property({
		type: "text",
	})
	description: Opt<string> = "";

	@Property({
		type: "integer",
	})
	position: number;

	@Property({
		type: "text",
		length: 100,
	})
	claimedBy: Opt<string> = "";
}
