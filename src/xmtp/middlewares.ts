import type { AgentMiddleware } from "@xmtp/agent-sdk";
import {
	ContentTypeReaction,
	type Reaction,
} from "@xmtp/content-type-reaction";
import type { ThinkingReactionContext } from "./xmtp.types.js";

/**
 * Middleware to add and remove thinking emoji reaction
 */
export const eyesReactionMiddleware: AgentMiddleware = async (ctx, next) => {
	try {
		// Step 1: Add helper function to add the eyes emoji reaction
		const addThinkingEmoji = async () => {
			await ctx.conversation.send(
				{
					action: "added",
					content: "👀",
					reference: ctx.message.id,
					schema: "shortcode",
				} as Reaction,
				ContentTypeReaction,
			);
		};

		// Step 2: Add helper function to remove the eyes emoji
		const removeThinkingEmoji = async () => {
			await ctx.conversation.send(
				{
					action: "removed",
					content: "👀",
					reference: ctx.message.id,
					schema: "shortcode",
				} as Reaction,
				ContentTypeReaction,
			);
		};

		// Attach helper to context
		(ctx as ThinkingReactionContext).helpers = {
			addThinkingEmoji,
			removeThinkingEmoji,
		};

		await next();
	} catch (error) {
		console.error("Error in thinking reaction middleware:", error);
		// Continue anyway
		await next();
	}
};
