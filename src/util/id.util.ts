import { customAlphabet } from "nanoid";

const generateId = customAlphabet("abcdefghijklmnopqrstuvwxyz");

export function generateBoardId() {
	return generateId(6);
}
