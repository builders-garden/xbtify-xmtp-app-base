# Xbt Agent with XMTP Agent SDK

This is a basic XMTP XBT Agent that can be used to send and receive messages on the XMTP network. 
It uses the XMTP Agent SDK to create a basic agent that can be used to send and receive messages on the XMTP network.

It then hits the ai service to answer to dm and group messages.

## Prerequisites

- Node.js 20+
- pnpm
- nixpacks

## Kubernetes (Minikube) On-demand Provisioning

### Build image into Minikube

```bash
pnpm k8s:build-minikube
```

### Create namespace and RBAC

```bash
pnpm k8s:ns
```

### Provision a per-user agent

```bash
# Ensure your kubeconfig points to minikube context
tsx src/provisioner/cli.ts create \
  --fid 12345 \
  --backend-url https://your-backend.example \
  --backend-api-key sk_test_xxx \
  --xmtp-mnemonic "word1 word2 ..." \
  --xmtp-env dev \
  --xmtp-db-key 11973168e34839f9d31749ad77204359c5c39c404e1154eacb7f35a867ee47de
```

### Deprovision

```bash
tsx src/provisioner/cli.ts delete --fid 12345
```

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