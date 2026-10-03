import { TaskTodoStatus } from "../enum/task-todo-status.enum.js";

// A single item in a task's checklist. Tasks store the ordered list as a JSON
// column so a whole task's plan lives with the task itself.
export interface TaskTodo {
	content: string;
	status: TaskTodoStatus;
}
