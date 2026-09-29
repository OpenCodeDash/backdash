import {
	EntityRepository,
	UniqueConstraintViolationException,
} from "@mikro-orm/core";
import { BoardEntity } from "../entity/board.entity.js";
import { ColumnEntity } from "../entity/column.entity.js";
import { generateBoardId } from "#/util/id.util";

const MAX_ATTEMPTS = 5;

interface ColumnSeed {
	name: string;
	isQueue: boolean;
}

export const DEFAULT_COLUMNS: readonly ColumnSeed[] = [
	{ name: "Todo", isQueue: true },
	{ name: "In Progress", isQueue: false },
	{ name: "Done", isQueue: false },
];

export class BoardRepository extends EntityRepository<BoardEntity> {
	async newBoard(
		name: string,
		columns: readonly ColumnSeed[] = DEFAULT_COLUMNS
	): Promise<BoardEntity> {
		let lastError: unknown;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const id = generateBoardId();

			const em = this.em.fork();

			try {
				const board = em.create(BoardEntity, { id, name });

				for (const [position, seed] of columns.entries()) {
					em.create(ColumnEntity, {
						board,
						name: seed.name,
						position,
						isQueue: seed.isQueue,
					});
				}

				await em.flush();

				return await this.findWithColumns(id);
			} catch (error) {
				if (!(error instanceof UniqueConstraintViolationException)) {
					throw error;
				}

				lastError = error;
			}
		}

		throw lastError;
	}

	findWithColumns(id: string): Promise<BoardEntity> {
		return this.findOneOrFail({ id }, { populate: ["columns"] });
	}

	listWithColumns(): Promise<BoardEntity[]> {
		return this.findAll({
			populate: ["columns"],
			orderBy: { name: "asc" },
		});
	}
}
