import {
	Agent,
	type Client,
	type DecodedMessage,
	type Group,
	type GroupMember,
	IdentifierKind,
	type Signer,
} from "@xmtp/agent-sdk";
import type { GroupUpdated } from "@xmtp/content-type-group-updated";
import { GroupUpdatedCodec } from "@xmtp/content-type-group-updated";
import type { Reaction } from "@xmtp/content-type-reaction";
import { ReactionCodec } from "@xmtp/content-type-reaction";
import {
	type RemoteAttachment,
	RemoteAttachmentCodec,
} from "@xmtp/content-type-remote-attachment";
import { type Reply, ReplyCodec } from "@xmtp/content-type-reply";
import type { WalletSendCallsParams } from "@xmtp/content-type-wallet-send-calls";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import { fromString } from "uint8arrays";
import {
	type Account,
	createWalletClient,
	type Hex,
	http,
	toBytes,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { XMTP_AGENTS } from "../lib/constants.js";
import { env } from "../lib/env.js";
import type { GroupUpdatedMessage } from "./xmtp.types.js";

/**
 * Get encryption key from string
 * @param encryptionKey - The encryption key string
 * @returns The encryption key
 */
export const getEncryptionKeyFromString = (encryptionKey: string) => {
	return fromString(encryptionKey);
};
/**
 * Get the XMTP agent
 * @returns The XMTP agent
 */
export const createXmtpAgent = async () => {
	const dbEncryptionKey = env.XMTP_DB_ENCRYPTION_KEY
		? getEncryptionKeyFromString(env.XMTP_DB_ENCRYPTION_KEY)
		: undefined;
	const customDbPath = (inboxId: string) =>
		`${env.RAILWAY_VOLUME_MOUNT_PATH}/${env.XMTP_ENV}-${inboxId.slice(
			0,
			8,
		)}.db3`;

	let account: Account | undefined;
	if (env.XMTP_MNEMONIC) {
		account = mnemonicToAccount(env.XMTP_MNEMONIC);
	} else if (env.XMTP_PRIVATE_KEY) {
		account = privateKeyToAccount(env.XMTP_PRIVATE_KEY as Hex);
	}
	if (!account) {
		throw new Error("No account found");
	}
	const wallet = createWalletClient({
		account,
		chain: base,
		transport: http(),
	});
	const identifier = {
		identifier: account.address.toLowerCase(),
		identifierKind: IdentifierKind.Ethereum,
	};
	const signer: Signer = {
		type: "EOA",
		getIdentifier: () => identifier,
		signMessage: async (message: string) => {
			const signature = await wallet.signMessage({
				account,
				message,
			});
			return toBytes(signature);
		},
	};

	return Agent.create(signer, {
		env: env.XMTP_ENV,
		dbEncryptionKey,
		dbPath: customDbPath,
		codecs: [
			new ReplyCodec(),
			new GroupUpdatedCodec(),
			new WalletSendCallsCodec(),
			new ReactionCodec(),
			new RemoteAttachmentCodec(),
		],
	});
};

/**
 * Extract message content from different message types
 *
 * Handles various XMTP message types including replies and regular text messages.
 * For reply messages, it attempts to extract the actual user content from
 * various possible locations in the message structure.
 *
 * @param message - The decoded XMTP message
 * @returns The message content as a string
 */
export function extractMessageContent(message: DecodedMessage): string {
	// Handle reply messages
	if (message.contentType && message.contentType.typeId === "reply") {
		const replyContent = message.content as Reply;

		// Check if content is in the main content field
		if (replyContent && typeof replyContent === "object") {
			// Try different possible property names for the actual content
			if (replyContent.content) {
				return String(replyContent.content);
			}
		}

		// Check fallback field (might contain the actual user message)
		if (message.fallback && typeof message.fallback === "string") {
			// Extract the actual user message from the fallback format
			// Format: 'Replied with "actual message" to an earlier message'
			const fallbackText = message.fallback;
			const match = fallbackText.match(
				/Replied with "(.+)" to an earlier message/,
			);
			if (match?.[1]) {
				const actualMessage = match[1];
				return actualMessage;
			}

			// If pattern doesn't match, return the full fallback text
			return fallbackText;
		}

		// Check parameters field (might contain reply data)
		if (message.parameters && typeof message.parameters === "object") {
			const params = message.parameters;
			if (params.content) {
				return String(params.content);
			}
			if (params.text) {
				return String(params.text);
			}
		}

		// If content is null/undefined, return empty string to avoid errors
		if (replyContent === null || replyContent === undefined) {
			return "";
		}

		// Fallback to stringifying the whole content if structure is different
		return JSON.stringify(replyContent);
	}

	// Handle regular text messages
	const content = message.content;
	if (content === null || content === undefined) {
		return "";
	}
	return String(content);
}

/**
 * Handle group updated message
 *
 * This function handles group updated messages and logs the new members added.
 *
 * @param message - The decoded XMTP message
 */
export const getGroupUpdates = ({
	group,
	xmtpMessage,
	xmtpMembers,
	agentAddress,
	agentInboxId,
}: {
	group: Group;
	xmtpMessage: GroupUpdatedMessage;
	xmtpMembers: GroupMember[];
	agentAddress: string;
	agentInboxId: string;
}): {
	groupId: string;
	name: string;
	description: string;
	imageUrl: string;
	addedInboxes: string[];
	removedInboxes: string[];
	membersToAdd: { inboxId: string; address?: string }[];
} => {
	// track member additions
	const addedInboxes =
		xmtpMessage.content.addedInboxes?.map((i) => i.inboxId) || [];

	// track member removals
	const removedInboxes =
		xmtpMessage.content.removedInboxes?.map((i) => i.inboxId) || [];

	// track metadata changes
	const hasChangedName = xmtpMessage.content.metadataFieldChanges?.find(
		(c) => c.fieldName === "group_name",
	);
	const hasChangedDescription = xmtpMessage.content.metadataFieldChanges?.find(
		(c) => c.fieldName === "group_description",
	);
	const hasChangedImageUrl = xmtpMessage.content.metadataFieldChanges?.find(
		(c) => c.fieldName === "group_image_url_square",
	);

	if (
		addedInboxes.length > 0 ||
		removedInboxes.length > 0 ||
		hasChangedName ||
		hasChangedDescription ||
		hasChangedImageUrl
	) {
		console.log(
			"Group metadata changed:",
			JSON.stringify({
				addedInboxes,
				removedInboxes,
				hasChangedName,
				hasChangedDescription,
				hasChangedImageUrl,
			}),
		);

		// Update group metadata if changed
		const membersToAdd = addedInboxes
			.filter((inboxId) => inboxId !== agentInboxId)
			.map((inboxId) => {
				const member = xmtpMembers.find((m) => m.inboxId === inboxId);
				const address = member?.accountIdentifiers.find(
					(i) => i.identifierKind === IdentifierKind.Ethereum,
				)?.identifier;
				return { inboxId, address };
			})
			.filter((m) => m.address !== undefined && m.address !== agentAddress)
			.filter(
				(m) =>
					!XMTP_AGENTS.some(
						(a) => a.address.toLowerCase() === m.address?.toLowerCase(),
					),
			);

		return {
			groupId: group.id,
			name: hasChangedName?.newValue ?? group.name,
			description: hasChangedDescription?.newValue ?? group.description,
			imageUrl: hasChangedImageUrl?.newValue ?? group.imageUrl,
			addedInboxes,
			removedInboxes,
			membersToAdd,
		};
	}
	return {
		groupId: group.id,
		name: group.name,
		description: group.description,
		imageUrl: group.imageUrl,
		addedInboxes: [],
		removedInboxes: [],
		membersToAdd: [],
	};
};

/**
 * Check if a message is a reply to the agent
 *
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the message is a reply to the agent
 */
export async function isReplyToAgent(
	message: DecodedMessage,
	agentInboxId: string,
	client: Client<
		| string
		| Reply
		| WalletSendCallsParams
		| GroupUpdated
		| Reaction
		| RemoteAttachment
	>,
): Promise<boolean> {
	// Check if the message is a reply type
	if (message.contentType && message.contentType.typeId === "reply") {
		try {
			// Check the parameters for the reference message ID
			const parameters = message.parameters;
			if (!parameters || !parameters.reference) {
				return false;
			}

			const referenceMessageId = parameters.reference;

			// Get the conversation to find the referenced message
			const conversation = await client.conversations.getConversationById(
				message.conversationId,
			);
			if (!conversation) {
				console.error(
					`Conversation not found ${message.conversationId} on reply to message ${referenceMessageId}`,
				);
				return false;
			}

			// Get recent messages to find the referenced one
			const messages = await conversation.messages();
			const referencedMessage = messages.find(
				(msg) => msg.id === referenceMessageId,
			);
			if (!referencedMessage) {
				return false;
			}

			// Check if the referenced message was sent by the agent
			const isReplyToAgent =
				referencedMessage.senderInboxId.toLowerCase() ===
				agentInboxId.toLowerCase();

			return isReplyToAgent;
		} catch (error) {
			console.error(
				"Error checking if message is a reply to the agent:",
				error,
			);
			return false;
		}
	}
	return false;
}

/**
 * Check if the message is a reply to the agent
 *
 * @param message - The decoded XMTP message
 * @returns True if the message is a reply to the agent, false otherwise
 */
export const checkIfMessageIsReplyToAgent = async ({
	message,
	agentInboxId,
	agentUsername,
	client,
}: {
	message: DecodedMessage;
	agentInboxId: string;
	agentUsername: string;
	client: Client<
		| string
		| Reply
		| WalletSendCallsParams
		| GroupUpdated
		| Reaction
		| RemoteAttachment
	>;
}): Promise<boolean> => {
	const messageContent = extractMessageContent(message);

	// Safety check for empty content
	if (!messageContent || messageContent.trim() === "") {
		return false;
	}

	// 1. check if the message tags the agent via username
	const lowerMessage = messageContent.toLowerCase().trim().normalize();
	const patternAgentUsername = new RegExp(
		`@${agentUsername.toLowerCase().trim().normalize()}`,
	);
	const match = lowerMessage.match(patternAgentUsername);
	if (match) {
		return true;
	}

	// 2. check if the message is a reply to the agent
	const isReply = await isReplyToAgent(message, agentInboxId, client);

	return isReply;
};
