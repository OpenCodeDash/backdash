import {
	BadGatewayException,
	BadRequestException,
	NotFoundException,
} from "@nestjs/common";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchService } from "./research.service.js";

function json(
	res: import("node:http").ServerResponse,
	status: number,
	body: unknown
) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => resolve(body));
	});
}

let server: Server;
let baseUrl: string;
let seenAuth: string | undefined;

beforeAll(async () => {
	server = createServer((req, res) => {
		seenAuth = req.headers.authorization;
		const url = new URL(req.url ?? "/", "http://localhost");

		if (url.pathname === "/campaigns" && req.method === "GET") {
			return json(res, 200, { campaigns: [{ id: "c1", status: "complete" }] });
		}

		if (url.pathname === "/campaigns" && req.method === "POST") {
			void readBody(req).then((body) => {
				const input = JSON.parse(body) as { prompt?: string };
				json(res, 202, { campaign: { id: "c2", prompt: input.prompt } });
			});
			return;
		}

		if (url.pathname === "/campaigns/preview" && req.method === "POST") {
			void readBody(req).then((body) => {
				const input = JSON.parse(body) as { prompt?: string; pack?: string };
				json(res, 200, {
					brief: { version: 1, criteria: [] },
					criteria: [{ key: "parking", label: "Parking", weight: 0.8 }],
					echo: `Criteria for: ${input.prompt}`,
					warnings: [],
				});
			});
			return;
		}

		if (url.pathname === "/campaigns/missing") {
			return json(res, 404, { error: "not found" });
		}

		if (url.pathname === "/campaigns/error") {
			return json(res, 500, { error: "boom" });
		}

		if (url.pathname === "/campaigns/c1/results") {
			return json(res, 200, { counts: { listings: 2 }, rows: [] });
		}

		if (url.pathname === "/campaigns/c1/feedback") {
			void readBody(req).then((body) => {
				const input = JSON.parse(body) as { text: string };
				json(res, 200, {
					changed: true,
					action: "re-score",
					summary: input.text,
				});
			});
			return;
		}

		if (url.pathname === "/campaigns/c1/export.csv") {
			res.writeHead(200, { "content-type": "text/csv" });
			res.end("Rank,Score\n1,1\n");
			return;
		}

		if (url.pathname === "/campaigns/c1/events") {
			res.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
			});
			res.write(
				`data: ${JSON.stringify({ type: "status", campaign: { id: "c1" } })}\n\n`
			);
			res.write(
				`data: ${JSON.stringify({ type: "stage", stage: "collect" })}\n\n`
			);
			return;
		}

		json(res, 404, { error: "no route" });
	});

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve())
	);
	const address = server.address() as AddressInfo;
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

function service() {
	return new ResearchService({ baseUrl, token: "secret" });
}

describe("ResearchService", () => {
	it("proxies campaign listing with the harness token", async () => {
		const result = (await service().list()) as {
			campaigns: Array<{ id: string }>;
		};
		expect(result.campaigns[0]?.id).toBe("c1");
		expect(seenAuth).toBe("Bearer secret");
	});

	it("creates a campaign and requires a prompt or brief", async () => {
		const result = (await service().create({ prompt: "find a rental" })) as {
			campaign: { id: string; prompt: string };
		};
		expect(result.campaign.id).toBe("c2");
		expect(result.campaign.prompt).toBe("find a rental");

		await expect(service().create({})).rejects.toBeInstanceOf(
			BadRequestException
		);
	});

	it("previews criteria without creating a campaign", async () => {
		const preview = (await service().preview({
			prompt: "find a rental",
			pack: "property",
		})) as {
			criteria: Array<{ key: string }>;
			echo: string;
		};
		expect(preview.criteria[0]?.key).toBe("parking");
		expect(preview.echo).toContain("find a rental");
	});

	it("maps harness 404 and 5xx responses to Nest exceptions", async () => {
		await expect(service().get("missing")).rejects.toBeInstanceOf(
			NotFoundException
		);
		await expect(service().get("error")).rejects.toBeInstanceOf(
			BadGatewayException
		);
	});

	it("proxies results and feedback", async () => {
		const results = (await service().results("c1")) as {
			counts: { listings: number };
		};
		expect(results.counts.listings).toBe(2);

		const feedback = (await service().feedback("c1", "drop sunlight")) as {
			changed: boolean;
			action: string;
			summary: string;
		};
		expect(feedback.changed).toBe(true);
		expect(feedback.action).toBe("re-score");
		expect(feedback.summary).toBe("drop sunlight");
	});

	it("returns the CSV body", async () => {
		expect(await service().exportCsv("c1")).toContain("Rank,Score");
	});

	it("relays SSE frames and stops on unsubscribe", async () => {
		const events: unknown[] = [];
		await new Promise<void>((resolve, reject) => {
			const subscription = service().stream("c1").subscribe({
				next: (event) => {
					events.push(event.data);
					if (events.length === 2) {
						subscription.unsubscribe();
						resolve();
					}
				},
				error: reject,
			});
			setTimeout(() => {
				subscription.unsubscribe();
				reject(new Error("timed out waiting for events"));
			}, 3000).unref?.();
		});

		expect(events[0]).toMatchObject({ type: "status" });
		expect(events[1]).toMatchObject({ type: "stage", stage: "collect" });
	});
});
