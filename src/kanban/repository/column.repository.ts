import { EntityRepository } from "@mikro-orm/core";
import { ColumnEntity } from "../entity/column.entity.js";
import { BoardEntity } from "../entity/board.entity.js";

export class ColumnRepository extends EntityRepository<ColumnEntity> {
	// Left to right, the order they appear on the board
	findByBoard(boardId: string): Promise<ColumnEntity[]> {
		return this.find(
			{ board: boardId },
			{ orderBy: { position: "asc", id: "asc" } }
		);
	}

	// The columns agents are allowed to claim tasks from
	findQueues(boardId: string): Promise<ColumnEntity[]> {
		return this.find(
			{ board: boardId, isQueue: true },
			{ orderBy: { position: "asc", id: "asc" } }
		);
	}

	findByName(boardId: string, name: string): Promise<ColumnEntity | null> {
		return this.findOne({ board: boardId, name });
	}

	async nextPosition(boardId: string): Promise<number> {
		const last = await this.findOne(
			{ board: boardId },
			{ orderBy: { position: "desc" } }
		);

		if (!last) {
			return 0;
		}

		return last.position + 1;
	}

	async addColumn(
		board: BoardEntity,
		name: string,
		isQueue = false
	): Promise<ColumnEntity> {
		const column = this.create({
			board,
			name,
			position: await this.nextPosition(board.id),
			isQueue,
		});

		await this.em.persist(column).flush();

		return column;
	}

	async reorder(
		boardId: string,
		orderedIds: number[]
	): Promise<ColumnEntity[]> {
		const columns = await this.findByBoard(boardId);
		const byId = new Map(columns.map((column) => [column.id, column]));

		if (
			orderedIds.length !== columns.length ||
			new Set(orderedIds).size !== orderedIds.length ||
			!orderedIds.every((id) => byId.has(id))
		) {
			throw new Error(
				"orderedIds must list every column on the board exactly once"
			);
		}

		for (const [position, id] of orderedIds.entries()) {
			byId.get(id)!.position = position;
		}

		await this.em.flush();

		// Re-load with tasks (and their tags) populated so the response/event
		// payload does not degrade to empty task lists and wipe client state
		return this.em.find(
			ColumnEntity,
			{ board: boardId },
			{
				orderBy: { position: "asc", id: "asc" },
				populate: ["tasks", "tasks.tags"],
			}
		);
	}
}
