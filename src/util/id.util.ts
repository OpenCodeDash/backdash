import { customAlphabet } from "nanoid";

const generateId = customAlphabet("abcdefghijklmnopqrstuvwxyz");

export function generateBoardId() {
	return generateId(6);
}

export function generateAccountId() {
	return generateId(6);
}
