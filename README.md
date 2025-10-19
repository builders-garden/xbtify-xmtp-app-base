# Xbt Agent with XMTP Agent SDK

This is a basic XMTP XBT Agent that can be used to send and receive messages on the XMTP network. 
It uses the XMTP Agent SDK to create a basic agent that can be used to send and receive messages on the XMTP network.

It then hits the ai service to answer to dm and group messages.

## Prerequisites

- Node.js 20+
- pnpm
- nixpacks

## Getting Started

1. Clone the repository
2. Install the dependencies
3. Run the agent

## Environment Variables

- `BACKEND_URL`: The URL of the backend service
- `BACKEND_API_KEY`: The API key to use for the backend service
- `AGENT_FID`: The FID of the agent
- `XMTP_MNEMONIC`: The mnemonic of the wallet to use for the agent
- `XMTP_ENV`: The environment to use for the agent (local, dev, production)
- `XMTP_DB_ENCRYPTION_KEY`: The encryption key to use for the agent
- `RAILWAY_VOLUME_MOUNT_PATH`: The path to use for the agent