import { Migration } from '@mikro-orm/migrations';

export class Migration20261003094632_AddTaskSessionId extends Migration {

  override name = 'Migration20261003094632_AddTaskSessionId';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`tasks\` add column \`session_id\` text not null default '';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`tasks\` drop column \`session_id\`;`);
  }

}
