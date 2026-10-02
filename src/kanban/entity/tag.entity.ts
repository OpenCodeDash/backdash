import type { Opt, Rel } from "@mikro-orm/core";
import { Collection } from "@mikro-orm/core";
import {
	Entity,
	Index,
	ManyToMany,
	ManyToOne,
	PrimaryKey,
	Property,
	Unique,
} from "@mikro-orm/decorators/legacy";
import { BoardEntity } from "./board.entity.js";
import { TaskEntity } from "./task.entity.js";
import { TagRepository } from "../repository/tag.repository.js";

@Entity({
	tableName: "tags",
	repository: () => TagRepository,
})
@Unique({ properties: ["board", "name"] })
@Index({ properties: ["board"] })
export class TagEntity {
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
		length: 50,
	})
	name: string;

	@Property({
		type: "text",
		nullable: true,
	})
	description: Opt<string> | null = null;

	@Property({
		type: "text",
		nullable: true,
	})
	prompt: Opt<string> | null = null;

	@Property({
		type: "text",
		length: 20,
		nullable: true,
	})
	color: Opt<string> | null = null;

	@Property({
		type: "datetime",
		onCreate: () => new Date(),
	})
	createdAt: Opt<Date> = new Date();

	@Property({
		type: "datetime",
		onCreate: () => new Date(),
		onUpdate: () => new Date(),
	})
	updatedAt: Opt<Date> = new Date();

	// Inverse side; TaskEntity owns the many-to-many relation
	@ManyToMany(() => TaskEntity, (task) => task.tags)
	tasks = new Collection<TaskEntity>(this);
}
