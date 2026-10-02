import { EntityRepository } from "@mikro-orm/core";
import { TagEntity } from "../entity/tag.entity.js";

export class TagRepository extends EntityRepository<TagEntity> {
	// Alphabetical; the order tags are presented in the UI
	findByBoard(boardId: string): Promise<TagEntity[]> {
		return this.find({ board: boardId }, { orderBy: { name: "asc" } });
	}

	findByName(boardId: string, name: string): Promise<TagEntity | null> {
		return this.findOne({ board: boardId, name });
	}
}
