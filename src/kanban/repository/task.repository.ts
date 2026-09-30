import { EntityRepository } from "@mikro-orm/core";
import { TaskEntity } from "../entity/task.entity.js";

export class TaskRepository extends EntityRepository<TaskEntity> {
	// Top to bottom, the order they appear in the column
	findByColumn(columnId: number): Promise<TaskEntity[]> {
		return this.find(
			{ column: columnId },
			{ orderBy: { position: "asc", id: "asc" } }
		);
	}

	async nextPosition(columnId: number): Promise<number> {
		const [last] = await this.find(
			{ column: columnId },
			{ orderBy: { position: "desc" }, limit: 1 }
		);

		return last ? last.position + 1 : 0;
	}
}
