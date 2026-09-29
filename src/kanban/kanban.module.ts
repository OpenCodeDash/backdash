import { Module } from "@nestjs/common";
import { KanbanService } from "./kanban.service.js";
import { KanbanController } from "./kanban.controller.js";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { BoardEntity } from "./entity/board.entity.js";
import { ColumnEntity } from "./entity/column.entity.js";

@Module({
	imports: [MikroOrmModule.forFeature([BoardEntity, ColumnEntity])],
	controllers: [KanbanController],
	providers: [KanbanService],
	exports: [KanbanService],
})
export class KanbanModule {}
