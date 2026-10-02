import { Migration } from '@mikro-orm/migrations';

export class Migration20261002014556_AddTaskMetadataAndTags extends Migration {

  override name = 'Migration20261002014556_AddTaskMetadataAndTags';

  override up(): void | Promise<void> {
    this.addSql(`create table \`tags\` (\`id\` integer not null primary key autoincrement, \`board_id\` text not null, \`name\` text not null, \`description\` text null, \`prompt\` text null, \`color\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`tags_board_id_foreign\` foreign key (\`board_id\`) references \`boards\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`tags_board_id_index\` on \`tags\` (\`board_id\`);`);
    this.addSql(`create unique index \`tags_board_id_name_unique\` on \`tags\` (\`board_id\`, \`name\`);`);

    // SQLite cannot add NOT NULL columns to a populated table, so rebuild it.
    // Existing rows get the migration time for both timestamps.
    this.addSql(`alter table \`tasks\` rename to \`tasks_old\`;`);
    this.addSql(`create table \`tasks\` (\`id\` integer not null primary key autoincrement, \`column_id\` integer not null, \`name\` text not null, \`description\` text not null default '', \`position\` integer not null, \`claimed_by\` text not null default '', \`priority\` text null, \`estimate\` integer null, \`assignee\` text null, \`due_at\` datetime null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`tasks_column_id_foreign\` foreign key (\`column_id\`) references \`columns\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`tasks\` (\`id\`, \`column_id\`, \`name\`, \`description\`, \`position\`, \`claimed_by\`, \`created_at\`, \`updated_at\`) select \`id\`, \`column_id\`, \`name\`, \`description\`, \`position\`, \`claimed_by\`, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP from \`tasks_old\`;`);
    this.addSql(`drop table \`tasks_old\`;`);
    this.addSql(`create index \`tasks_column_id_index\` on \`tasks\` (\`column_id\`);`);
    this.addSql(`create index \`tasks_column_id_position_index\` on \`tasks\` (\`column_id\`, \`position\`);`);

    this.addSql(`create table \`tasks_tags\` (\`task_entity_id\` integer not null, \`tag_entity_id\` integer not null, primary key (\`task_entity_id\`, \`tag_entity_id\`), constraint \`tasks_tags_task_entity_id_foreign\` foreign key (\`task_entity_id\`) references \`tasks\` (\`id\`) on update cascade on delete cascade, constraint \`tasks_tags_tag_entity_id_foreign\` foreign key (\`tag_entity_id\`) references \`tags\` (\`id\`) on update cascade on delete cascade);`);
    this.addSql(`create index \`tasks_tags_task_entity_id_index\` on \`tasks_tags\` (\`task_entity_id\`);`);
    this.addSql(`create index \`tasks_tags_tag_entity_id_index\` on \`tasks_tags\` (\`tag_entity_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`tasks_tags\`;`);
    this.addSql(`drop table if exists \`tags\`;`);

    // Rebuild tasks without the metadata columns
    this.addSql(`alter table \`tasks\` rename to \`tasks_old\`;`);
    this.addSql(`create table \`tasks\` (\`id\` integer not null primary key autoincrement, \`column_id\` integer not null, \`name\` text not null, \`description\` text not null default '', \`position\` integer not null, \`claimed_by\` text not null default '', constraint \`tasks_column_id_foreign\` foreign key (\`column_id\`) references \`columns\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`tasks\` (\`id\`, \`column_id\`, \`name\`, \`description\`, \`position\`, \`claimed_by\`) select \`id\`, \`column_id\`, \`name\`, \`description\`, \`position\`, \`claimed_by\` from \`tasks_old\`;`);
    this.addSql(`drop table \`tasks_old\`;`);
    this.addSql(`create index \`tasks_column_id_index\` on \`tasks\` (\`column_id\`);`);
    this.addSql(`create index \`tasks_column_id_position_index\` on \`tasks\` (\`column_id\`, \`position\`);`);
  }

}
