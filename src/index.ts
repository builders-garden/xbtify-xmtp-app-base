import { filter } from "@xmtp/agent-sdk";
import { logDetails } from "@xmtp/agent-sdk/debug";
import type { AskResponse } from "./lib/backend.types.js";
import { env } from "./lib/env.js";
import { eyesReactionMiddleware } from "./xmtp/middlewares.js";
import type { ThinkingReactionContext } from "./xmtp/xmtp.types.js";
import { createXmtpAgent, extractMessageContent } from "./xmtp/xmtp.utils.js";

async function main() {
	const askAgentUrl = `${env.BACKEND_URL}/api/agent/${env.AGENT_FID}/ask`;
	console.log("👽 BASIC XMTP XBT AGENT 🗿");

	// Create agent using environment variables
	const xmtpAgent = await createXmtpAgent();

	// get agent address
	const agentAddress = xmtpAgent.address;
	if (!agentAddress) {
		console.error("❌ Unable to get xmtp agent address");
		throw new Error("Unable to get xmtp agent address");
	}

	// XMTP Agent middlewares
	xmtpAgent.use(eyesReactionMiddleware);

	xmtpAgent.on("message", async (ctx) => {
		console.log(`Message received: ${JSON.stringify(ctx.message.content)}`);
		const thinkingContext = ctx as ThinkingReactionContext;

		// skip if message has no content or is from the agent or its a reaction
		if (
			!filter.hasContent(ctx.message) ||
			filter.fromSelf(ctx.message, ctx.client) ||
			ctx.message.contentType?.typeId === "reaction"
		) {
			console.log("Skipping message");
			return;
		}

		await thinkingContext.helpers.addThinkingEmoji();

		const messageContent = extractMessageContent(ctx.message);

		// Handle DM messages
		if (ctx.isDm()) {
			console.log("Handling DM message");
			const responseDm = await fetch(askAgentUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-secret": env.BACKEND_API_KEY,
				},
				body: JSON.stringify({
					question: messageContent,
				}),
			});

			const answerDm = (await responseDm.json()) as AskResponse;
			if (answerDm.status === "ok" && answerDm.data.answer) {
				await ctx.sendTextReply(answerDm.data.answer);
			}
		}

		// Handle group messages
		if (ctx.isGroup()) {
			console.log("Handling group message");

			// Handle reply to the agent
			const responseGroup = await fetch(askAgentUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-secret": env.BACKEND_API_KEY,
				},
				body: JSON.stringify({
					question: messageContent,
				}),
			});

			if (!responseGroup.ok) {
				console.error("❌ Unable to get group response");
			}

			const answerGroup = (await responseGroup.json()) as AskResponse;
			if (answerGroup.status === "ok" && answerGroup.data.answer) {
				await ctx.sendTextReply(answerGroup.data.answer);
			}
		}
	});

	xmtpAgent.on("unknownMessage", async (ctx) => {
		console.log(`Unknown message received: ${JSON.stringify(ctx)}`);
	});

	xmtpAgent.on("unhandledError", async (ctx) => {
		console.log(`Unhandled error received: ${JSON.stringify(ctx)}`);
	});

	// Handle startup
	xmtpAgent.on("start", async () => {
		console.log("👽 BASIC XMTP XBT AGENT is running...");
		logDetails(xmtpAgent.client);
	});

	await xmtpAgent.start();

	// Unified graceful shutdown
	let isShuttingDown = false;
	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		console.log(`${signal} received, shutting down...`);

		const tasks: Array<Promise<unknown>> = [];

		// Stop XMTP Agent
		try {
			tasks.push(xmtpAgent.stop?.() ?? Promise.resolve());
		} catch {}

		await Promise.allSettled(tasks);
		console.log("Shutdown complete. Exiting.");
		setTimeout(() => process.exit(0), 100).unref();
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
	console.error(error);
	throw error;
});
