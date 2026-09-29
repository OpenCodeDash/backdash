export function parseLastEventId(
	header?: string,
	query?: string
): number | undefined {
	const raw = header ?? query;

	if (raw === undefined || raw.trim() === "") {
		return undefined;
	}

	const value = Number(raw);

	if (!Number.isInteger(value) || value < 0) {
		return undefined;
	}

	return value;
}
