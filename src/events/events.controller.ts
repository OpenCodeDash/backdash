import {
	Controller,
	Headers,
	MessageEvent,
	NotFoundException,
	Param,
	Query,
	Sse,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiProduces,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import { Observable } from "rxjs";
import { EventsService } from "./events.service.js";
import { EventResponse } from "./response/event.response.js";
import { parseLastEventId } from "#/util/events.util";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { BoardRepository } from "#/kanban/repository/board.repository";

const STREAM_NOTES =
	"Server-sent events. Each message's `id` is the event `seq` and its `data` " +
	"is an Event as JSON. Two named events are also sent: `ping` (heartbeat, " +
	"ignore it) and `resync` (history was pruned; refetch full state).";

@ApiTags("events")
@ApiBearerAuth()
@Controller()
export class EventsController {
	constructor(
		private readonly events: EventsService,
		@InjectRepository(BoardEntity)
		private readonly boardsRepo: BoardRepository
	) {}

	@Sse("boards/:boardId/events")
	@ApiOperation({
		summary: "Stream events for one board",
		description: STREAM_NOTES,
	})
	@ApiProduces("text/event-stream")
	@ApiQuery({ name: "lastEventId", required: false, type: Number })
	@ApiOkResponse({ type: EventResponse })
	@ApiNotFoundResponse({ description: "Board not found" })
	async streamBoard(
		@Param("boardId") boardId: string,
		@Headers("last-event-id") lastEventIdHeader?: string,
		@Query("lastEventId") lastEventIdQuery?: string
	): Promise<Observable<MessageEvent>> {
		// Checked before the stream starts so a bad id is a real 404, not an
		// empty stream that never emits
		const boardExists = (await this.boardsRepo.count({ id: boardId })) > 0;
		if (!boardExists) {
			throw new NotFoundException("Board not found");
		}

		return this.events.stream(
			boardId,
			parseLastEventId(lastEventIdHeader, lastEventIdQuery)
		);
	}

	@Sse("events")
	@ApiOperation({
		summary: "Stream events for all boards",
		description: STREAM_NOTES,
	})
	@ApiProduces("text/event-stream")
	@ApiQuery({ name: "lastEventId", required: false, type: Number })
	@ApiOkResponse({ type: EventResponse })
	streamAll(
		@Headers("last-event-id") lastEventIdHeader?: string,
		@Query("lastEventId") lastEventIdQuery?: string
	): Observable<MessageEvent> {
		return this.events.stream(
			undefined,
			parseLastEventId(lastEventIdHeader, lastEventIdQuery)
		);
	}
}
