import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { of } from "rxjs";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { getRepositoryToken } from "@mikro-orm/nestjs";
import { BoardEntity } from "#/kanban/entity/board.entity";

interface EventsMock {
	stream: ReturnType<typeof vi.fn>;
}
interface BoardsMock {
	count: ReturnType<typeof vi.fn>;
}

describe("EventsController", () => {
	let controller: EventsController;
	let events: EventsMock;
	let boards: BoardsMock;

	beforeEach(async () => {
		events = { stream: vi.fn() };
		boards = { count: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [EventsController],
			providers: [
				{ provide: EventsService, useValue: events },
				{ provide: getRepositoryToken(BoardEntity), useValue: boards },
			],
		}).compile();
		controller = module.get(EventsController);
	});

	it("streamBoard 404s when the board does not exist", async () => {
		boards.count.mockResolvedValue(0);
		await expect(controller.streamBoard("missing", undefined, undefined)).rejects.toBeInstanceOf(
			NotFoundException
		);
		expect(events.stream).not.toHaveBeenCalled();
	});

	it("streamBoard streams for an existing board, parsing the header lastEventId", async () => {
		boards.count.mockResolvedValue(1);
		events.stream.mockReturnValue(of({ id: "1", data: {} }));

		const res = await controller.streamBoard("abc123", "5", undefined);

		expect(boards.count).toHaveBeenCalledWith({ id: "abc123" });
		expect(events.stream).toHaveBeenCalledWith("abc123", 5);
		expect(res).toBeDefined();
	});

	it("streamBoard falls back to the query lastEventId", async () => {
		boards.count.mockResolvedValue(1);
		events.stream.mockReturnValue(of({ id: "1", data: {} }));

		await controller.streamBoard("abc123", undefined, "9");

		expect(events.stream).toHaveBeenCalledWith("abc123", 9);
	});

	it("streamAll streams the global feed without a board id", () => {
		events.stream.mockReturnValue(of({ id: "1", data: {} }));

		const res = controller.streamAll(undefined, undefined);

		expect(events.stream).toHaveBeenCalledWith(undefined, undefined);
		expect(res).toBeDefined();
	});
});
