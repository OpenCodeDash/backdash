import {
	Injectable,
	Logger,
	MessageEvent,
	OnModuleDestroy,
	OnModuleInit,
} from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { Observable, Subject, filter } from "rxjs";
import { EventResponse } from "./response/event.response.js";
import { EventEntity } from "./entity/event.entity.js";
import { EventRepository } from "./repository/event.repository.js";

const PAGE_SIZE = 500;
const HEARTBEAT_MS = 20_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

// Default (unnamed) SSE event, with the event type inside the data. The only
// named events are "ping" and "resync", so clients need a single onmessage
// handler plus two small listeners.
function toSse(message: EventResponse): MessageEvent {
	return { id: String(message.seq), data: message };
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(EventsService.name);
	private readonly live = new Subject<EventResponse>();
	private pruneTimer?: NodeJS.Timeout;

	constructor(private readonly em: EntityManager) {}

	onModuleInit(): void {
		void this.pruneSafely();

		this.pruneTimer = setInterval(
			() => void this.pruneSafely(),
			PRUNE_EVERY_MS
		);
		this.pruneTimer.unref();
	}

	onModuleDestroy(): void {
		clearInterval(this.pruneTimer);
		this.live.complete();
	}

	// Call AFTER the flush/commit that wrote the events (seq only exists then),
	// and after em.transactional() has resolved, never inside its callback.
	publish(events: EventEntity[]): void {
		for (const event of events) {
			this.live.next(EventResponse.from(event));
		}
	}

	// boardId omitted = global stream. lastEventId is the Last-Event-ID header.
	stream(boardId?: string, lastEventId?: number): Observable<MessageEvent> {
		return new Observable<MessageEvent>((subscriber) => {
			let closed = false;
			let replaying = lastEventId !== undefined;
			let lastSent = lastEventId ?? 0;
			const buffer: EventResponse[] = [];

			// Drops anything already delivered, which is what stitches replay and
			// live together without duplicates. Relies on events being published in
			// seq order, which holds because SQLite serialises writers.
			const send = (message: EventResponse): void => {
				if (message.seq <= lastSent) {
					return;
				}

				lastSent = message.seq;
				subscriber.next(toSse(message));
			};

			// Subscribe to live BEFORE querying the backlog so nothing can fall in
			// the gap between the two. Live events wait in the buffer during replay.
			const liveSubscription = this.live
				.pipe(
					filter(
						(message) => boardId === undefined || message.boardId === boardId
					)
				)
				.subscribe((message) => {
					if (replaying) {
						buffer.push(message);

						return;
					}

					send(message);
				});

			const heartbeat = setInterval(() => {
				subscriber.next({ type: "ping", data: "" });
			}, HEARTBEAT_MS);

			const catchUp = async (): Promise<void> => {
				if (lastEventId !== undefined) {
					const repository = this.repository();
					const oldest = await repository.oldestSeq();

					if (oldest !== null && lastEventId < oldest - 1) {
						// Events were pruned before this client saw them: tell it to
						// refetch full state instead of replaying a partial history
						subscriber.next({ type: "resync", data: {} });
					} else {
						let cursor = lastEventId;

						while (!closed) {
							const page = await repository.findAfter(
								cursor,
								boardId,
								PAGE_SIZE
							);

							for (const event of page) {
								send(EventResponse.from(event));
							}

							if (page.length < PAGE_SIZE) {
								break;
							}

							cursor = page[page.length - 1].seq;
						}
					}
				}

				// No await between here and the end, so no live event can slip past
				replaying = false;

				for (const message of buffer.splice(0)) {
					send(message);
				}
			};

			catchUp().catch((error) => subscriber.error(error));

			return () => {
				closed = true;
				clearInterval(heartbeat);
				liveSubscription.unsubscribe();
			};
		});
	}

	async prune(): Promise<number> {
		const cutoff = new Date(Date.now() - RETENTION_MS);

		return this.repository().pruneOlderThan(cutoff);
	}

	private async pruneSafely(): Promise<void> {
		try {
			const removed = await this.prune();

			if (removed > 0) {
				this.logger.log(`Pruned ${removed} old events`);
			}
		} catch (error) {
			this.logger.error("Failed to prune events", error);
		}
	}

	// A fork per use: long-lived streams and background jobs must not share, or
	// grow, the request-scoped identity map.
	private repository(): EventRepository {
		return this.em.fork().getRepository(EventEntity) as EventRepository;
	}
}
