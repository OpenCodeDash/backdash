import { BoardEntity } from "#/kanban/entity/board.entity";
import { EntityRepository } from "@mikro-orm/core";
import { EventEntity } from "../entity/event.entity.js";
import { EventType } from "../enum/event-type.enum.js";

export class EventRepository extends EntityRepository<EventEntity> {
	append(
		board: BoardEntity,
		type: EventType,
		actor: string,
		payload: Record<string, unknown> = {}
	): EventEntity {
		const event = this.create({ board, type, actor, payload });

		this.em.persist(event);

		return event;
	}

	findAfter(
		afterSeq: number,
		boardId?: string,
		limit = 500
	): Promise<EventEntity[]> {
		const options = { orderBy: { seq: "asc" as const }, limit };

		if (boardId === undefined) {
			return this.find({ seq: { $gt: afterSeq } }, options);
		}

		return this.find({ seq: { $gt: afterSeq }, board: boardId }, options);
	}

	async oldestSeq(): Promise<number | null> {
		const [first] = await this.find({}, {
			orderBy: { seq: "asc" },
			limit: 1,
			fields: ["seq"],
		});

		if (!first) {
			return null;
		}

		return first.seq;
	}

	async pruneOlderThan(cutoff: Date, batchSize = 2000): Promise<number> {
		let total = 0;

		while (true) {
			const batch = await this.find(
				{ createdAt: { $lt: cutoff } },
				{ orderBy: { seq: "asc" }, limit: batchSize, fields: ["seq"] }
			);

			if (batch.length === 0) {
				break;
			}

			const lastSeq = batch[batch.length - 1].seq;

			const deleted = await this.nativeDelete({
				seq: { $lte: lastSeq },
				createdAt: { $lt: cutoff },
			});

			total += deleted;

			if (deleted === 0 || batch.length < batchSize) {
				break;
			}
		}

		return total;
	}
}
