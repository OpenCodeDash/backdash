import {
	Entity,
	OneToMany,
	PrimaryKey,
	Property,
} from "@mikro-orm/decorators/legacy";
import { BoardRepository } from "../repository/board.repository.js";
import { ColumnEntity } from "./column.entity.js";
import { TagEntity } from "./tag.entity.js";
import { Collection } from "@mikro-orm/core";

@Entity({
	tableName: "boards",
	repository: () => BoardRepository,
})
export class BoardEntity {
	@PrimaryKey({
		type: "text",
		length: 6,
	})
	id: string;

	@Property({
		type: "text",
		length: 200,
	})
	name: string;

	@OneToMany(() => ColumnEntity, (column) => column.board, {
		orphanRemoval: true,
		orderBy: { position: "asc", id: "asc" },
	})
	columns = new Collection<ColumnEntity>(this);

	@OneToMany(() => TagEntity, (tag) => tag.board, {
		orphanRemoval: true,
		orderBy: { name: "asc" },
	})
	tags = new Collection<TagEntity>(this);
}
