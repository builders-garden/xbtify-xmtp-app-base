import { filter, type Group } from "@xmtp/agent-sdk";
import { logDetails } from "@xmtp/agent-sdk/debug";
import { env } from "./lib/env.js";
import { eyesReactionMiddleware } from "./xmtp/middlewares.js";
import type {
	GroupUpdatedMessage,
	ThinkingReactionContext,
} from "./xmtp/xmtp.types.js";
import {
	createXmtpAgent,
	extractMessageContent,
	getGroupUpdates,
} from "./xmtp/xmtp.utils.js";

async function main() {
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

		const conversationId = ctx.conversation.id;
		const senderAddress = await ctx.getSenderAddress();
		const messageContent = extractMessageContent(ctx.message);

		// Handle DM messages
		if (ctx.isDm()) {
			console.log("Handling DM message");
			const inboxId = ctx.conversation.peerInboxId;
			const answer = await fetch(`${env.BACKEND_URL}/dm/reply`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.BACKEND_API_KEY,
				},
				body: JSON.stringify({
					conversationId,
					senderAddress,
					inboxId,
					message: messageContent,
				}),
			}).then(async (res) => await res.json());

			if (answer.answer) {
				await ctx.sendTextReply(answer.answer);
			}
		}

		// Handle group messages
		if (ctx.isGroup()) {
			console.log("Handling group message");
			const xmtpMessage = ctx.message as GroupUpdatedMessage;
			const xmtpMembers = await ctx.conversation.members();

			// Handle group metadata updates
			if (ctx.message.contentType?.typeId === "group_updated") {
				const groupUpdates = getGroupUpdates({
					group: ctx.conversation as Group,
					xmtpMessage,
					xmtpMembers,
					agentAddress,
					agentInboxId: ctx.client.inboxId,
				});

				// update group metadata
				await fetch(`${env.BACKEND_URL}/group/metadata`, {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": env.BACKEND_API_KEY,
					},
					body: JSON.stringify(groupUpdates),
				});
			}

			// Handle reply to the agent
			const answer = await fetch(`${env.BACKEND_URL}/group/reply`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.BACKEND_API_KEY,
				},
				body: JSON.stringify({
					message: messageContent,
					conversationId,
					senderAddress,
					members: xmtpMembers,
				}),
			}).then(async (res) => await res.json());
			if (answer.answer) {
				await ctx.sendTextReply(answer.answer);
			}
		}
	});

	xmtpAgent.on("group", async (ctx) => {
		const conversationId = ctx.conversation.id;
		console.log("Group received event", conversationId);
		const { group, isNew, welcomeMessage } = await fetch(
			`${env.BACKEND_URL}/group`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.BACKEND_API_KEY,
				},
			},
		).then(async (res) => await res.json());

		// If is new group, send welcome message and actions
		if (isNew && welcomeMessage) {
			console.log("Sending welcome message to new group", group.id);
			await ctx.conversation.send(welcomeMessage);
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
