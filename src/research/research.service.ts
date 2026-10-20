import {
	BadGatewayException,
	BadRequestException,
	Injectable,
	NotFoundException,
	type MessageEvent,
} from "@nestjs/common";
import { Observable } from "rxjs";

export interface ResearchServiceOptions {
	baseUrl?: string;
	token?: string;
	fetchImpl?: typeof fetch;
}

export interface CreateCampaignInput {
	prompt?: string;
	brief?: string;
	pack?: string;
	name?: string;
}

// Backdash is a thin, authenticated front door to the harness daemon. The
// harness owns campaigns, listings, scores, and feedback; backdash never copies
// that data, so there is only one source of truth.
@Injectable()
export class ResearchService {
	private readonly baseUrl: string;
	private readonly token?: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: ResearchServiceOptions = {}) {
		this.baseUrl = (
			options.baseUrl ??
			process.env.HARNESS_URL ??
			"http://127.0.0.1:7332"
		).replace(/\/$/, "");
		this.token = options.token ?? process.env.HARNESS_TOKEN;
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	private authHeaders(): Record<string, string> {
		return this.token ? { authorization: `Bearer ${this.token}` } : {};
	}

	private async request(path: string, init: RequestInit = {}): Promise<Response> {
		const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				...(init.body ? { "content-type": "application/json" } : {}),
				...this.authHeaders(),
				...(init.headers as Record<string, string> | undefined),
			},
		});

		if (response.status === 404) {
			throw new NotFoundException("research campaign not found");
		}
		if (response.status === 400) {
			const body = await response.text().catch(() => "");
			throw new BadRequestException(body || "invalid research request");
		}
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new BadGatewayException(
				`harness ${response.status}: ${body.slice(0, 200)}`
			);
		}
		return response;
	}

	async list(): Promise<unknown> {
		return (await this.request("/campaigns")).json();
	}

	async get(id: string): Promise<unknown> {
		return (
			await this.request(`/campaigns/${encodeURIComponent(id)}`)
		).json();
	}

	async create(input: CreateCampaignInput): Promise<unknown> {
		if (!input.prompt?.trim() && !input.brief?.trim()) {
			throw new BadRequestException("prompt or brief is required");
		}
		const response = await this.request("/campaigns", {
			method: "POST",
			body: JSON.stringify({
				prompt: input.prompt?.trim() || undefined,
				brief: input.brief?.trim() || undefined,
				pack: input.pack,
				name: input.name,
			}),
		});
		return response.json();
	}

	async results(id: string): Promise<unknown> {
		return (
			await this.request(`/campaigns/${encodeURIComponent(id)}/results`)
		).json();
	}

	async feedback(id: string, text: string): Promise<unknown> {
		return (
			await this.request(`/campaigns/${encodeURIComponent(id)}/feedback`, {
				method: "POST",
				body: JSON.stringify({ text }),
			})
		).json();
	}

	async pause(id: string): Promise<unknown> {
		return this.action(id, "pause");
	}

	async resume(id: string): Promise<unknown> {
		return this.action(id, "resume");
	}

	async stop(id: string): Promise<unknown> {
		return this.action(id, "stop");
	}

	private async action(id: string, action: string): Promise<unknown> {
		return (
			await this.request(`/campaigns/${encodeURIComponent(id)}/${action}`, {
				method: "POST",
			})
		).json();
	}

	async exportCsv(id: string): Promise<string> {
		const response = await this.request(
			`/campaigns/${encodeURIComponent(id)}/export.csv`
		);
		return response.text();
	}

	// Relays the harness SSE stream without buffering it. The subscription
	// teardown aborts the upstream fetch, so a closed browser tab does not leave
	// a harness connection open.
	stream(id: string): Observable<MessageEvent> {
		return new Observable<MessageEvent>((subscriber) => {
			const controller = new AbortController();
			let closed = false;

			void (async () => {
				const response = await this.fetchImpl(
					`${this.baseUrl}/campaigns/${encodeURIComponent(id)}/events`,
					{
						headers: {
							accept: "text/event-stream",
							...this.authHeaders(),
						},
						signal: controller.signal,
					}
				);

				if (!response.ok || !response.body) {
					throw new BadGatewayException(
						`harness stream ${response.status}`
					);
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (!closed) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });

					let index: number;
					while ((index = buffer.indexOf("\n\n")) >= 0) {
						const frame = buffer.slice(0, index);
						buffer = buffer.slice(index + 2);
						const data = frame
							.split("\n")
							.filter((line) => line.startsWith("data:"))
							.map((line) => line.slice(5).trimStart())
							.join("\n");
						if (!data) continue;

						let payload: unknown = data;
						try {
							payload = JSON.parse(data);
						} catch {
							// keep the raw text; the UI can show it
						}
						subscriber.next({ data: payload as string | object });
					}
				}

				if (!closed) subscriber.complete();
			})().catch((error: unknown) => {
				if (closed) return;
				subscriber.error(
					error instanceof BadGatewayException
						? error
						: new BadGatewayException(
								error instanceof Error ? error.message : String(error)
							)
				);
			});

			return () => {
				closed = true;
				controller.abort();
			};
		});
	}
}
