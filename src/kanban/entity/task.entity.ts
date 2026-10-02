import type { Opt, Rel } from "@mikro-orm/core";
import { Collection } from "@mikro-orm/core";
import {
	Entity,
	Index,
	ManyToMany,
	ManyToOne,
	PrimaryKey,
	Property,
} from "@mikro-orm/decorators/legacy";
import { ColumnEntity } from "./column.entity.js";
import { TagEntity } from "./tag.entity.js";
import { TaskRepository } from "../repository/task.repository.js";
import { TaskPriority } from "../enum/task-priority.enum.js";

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

	@Property({
		type: "text",
		length: 10,
		nullable: true,
	})
	priority: Opt<TaskPriority> | null = null;

	@Property({
		type: "integer",
		nullable: true,
	})
	estimate: Opt<number> | null = null;

	@Property({
		type: "text",
		length: 100,
		nullable: true,
	})
	assignee: Opt<string> | null = null;

	@Property({
		type: "datetime",
		nullable: true,
	})
	dueAt: Opt<Date> | null = null;

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

	// Owning side of the task<->tag many-to-many
	@ManyToMany(() => TagEntity, (tag) => tag.tasks, { owner: true })
	tags = new Collection<TagEntity>(this);

	// Tasks this task depends on (prerequisites that should be done first).
	// Owning side of the task<->task many-to-many; `dependents` is the inverse
	// (tasks that depend on this one). Both are scoped to the task's board.
	@ManyToMany(() => TaskEntity, (task) => task.dependents, { owner: true })
	dependsOn = new Collection<TaskEntity>(this);

	@ManyToMany(() => TaskEntity, (task) => task.dependsOn)
	dependents = new Collection<TaskEntity>(this);
}
