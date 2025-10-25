# Xbt Agent with XMTP Agent SDK

This is a basic XMTP XBT Agent that can be used to send and receive messages on the XMTP network. 
It uses the XMTP Agent SDK to create a basic agent that can be used to send and receive messages on the XMTP network.

It then hits the ai service to answer to dm and group messages.

## What this service does

- Creates an XMTP agent using `@xmtp/agent-sdk`, with codecs for replies, reactions, group updates, and remote attachments configured.
- Subscribes to incoming messages and filters out non-user content (no content, from self, reactions) using `filter` helpers.
- Adds a temporary "thinking" reaction via middleware, extracts the text from the message (including reply content), and forwards it to your AI backend endpoint: `POST {BACKEND_URL}/api/agent/{AGENT_FID}/ask` with the header `x-api-secret: {BACKEND_API_KEY}`.
- Replies back in the same DM or group with the backend's `answer` when available.
- Logs agent startup details and gracefully handles shutdown signals.
- Persists the XMTP local database to a file named `{XMTP_ENV}-{inboxIdPrefix}.db3`. When `RAILWAY_VOLUME_MOUNT_PATH` is set (for example `/data`), the DB file is written there to allow persistence via a mounted volume.

## Prerequisites

- Node.js 20+
- pnpm

## Getting Started

1. Clone the repository
2. Install the dependencies
3. Run the agent

## Environment Variables

- `BACKEND_URL` (required): Base URL of the AI backend (used by `src/index.ts`).
- `BACKEND_API_KEY` (required): Shared secret sent as `x-api-secret` to the backend.
- `AGENT_FID` (required): Agent FID used to build the `/api/agent/{fid}/ask` URL.
- `XMTP_MNEMONIC` (required): 12/24-word mnemonic used to derive the XMTP signer.
- `XMTP_ENV` (optional): `local` | `dev` | `production` (defaults to `production`).
- `XMTP_DB_ENCRYPTION_KEY` (optional): Hex key to encrypt the local DB.
- `RAILWAY_VOLUME_MOUNT_PATH` (optional): Directory for the DB file (e.g. `/data`).

Notes:
- The agent currently uses `XMTP_MNEMONIC` for signing.