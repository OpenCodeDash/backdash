// Parses BACKDASH_CORS_ORIGINS (a comma-separated browser-origin allowlist)
// into the list of origins to permit. When unset, empty, or all-blank it
// returns "*" so local development keeps the previous permissive behaviour.
export function parseCorsOrigins(raw: string | undefined): string[] | "*" {
	const origins = (raw ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	return origins.length > 0 ? origins : "*";
}
