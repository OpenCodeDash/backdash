import { Module } from "@nestjs/common";
import { KanbanService } from "./kanban.service.js";
import { KanbanController } from "./kanban.controller.js";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { BoardEntity } from "./entity/board.entity.js";
import { ColumnEntity } from "./entity/column.entity.js";
import { TaskEntity } from "./entity/task.entity.js";
import { TagEntity } from "./entity/tag.entity.js";
import { EventsModule } from "../events/events.module.js";

// KanbanModule -> EventsModule only: the events module checks board existence
// through BoardRepository directly, so there is no cycle back to KanbanModule.
@Module({
	imports: [
		MikroOrmModule.forFeature([BoardEntity, ColumnEntity, TaskEntity, TagEntity]),
		EventsModule,
	],
	controllers: [KanbanController],
	providers: [KanbanService],
	exports: [KanbanService],
})
export class KanbanModule {}
