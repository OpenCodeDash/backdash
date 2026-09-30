import { Module } from "@nestjs/common";
import { EventsService } from "./events.service.js";
import { EventsController } from "./events.controller.js";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { BoardEntity } from "#/kanban/entity/board.entity";

// Does NOT import KanbanModule (KanbanModule imports us for EventsService);
// the controller checks board existence through BoardRepository directly.
@Module({
	imports: [MikroOrmModule.forFeature([BoardEntity])],
	controllers: [EventsController],
	providers: [EventsService],
	exports: [EventsService],
})
export class EventsModule {}
