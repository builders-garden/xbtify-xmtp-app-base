import k8s from "@kubernetes/client-node";

type ProvisionInput = {
	fid: string;
	backendUrl: string;
	backendApiKey: string;
	xmtpMnemonic: string;
	xmtpEnv: "dev" | "local" | "production";
	xmtpDbKey?: string;
};

const NAMESPACE = "xmtp-agents";

async function provisionAgent(input: ProvisionInput) {
	const kc = new k8s.KubeConfig();
	kc.loadFromDefault();
	const k8sCore = kc.makeApiClient(k8s.CoreV1Api);
	const apps = kc.makeApiClient(k8s.AppsV1Api);

	const name = `agent-${input.fid}`;

	const secret: k8s.V1Secret = {
		apiVersion: "v1",
		kind: "Secret",
		metadata: { name: `${name}-env`, namespace: NAMESPACE },
		stringData: {
			BACKEND_URL: input.backendUrl,
			BACKEND_API_KEY: input.backendApiKey,
			AGENT_FID: input.fid,
			XMTP_MNEMONIC: input.xmtpMnemonic,
			XMTP_ENV: input.xmtpEnv,
			XMTP_DB_ENCRYPTION_KEY: input.xmtpDbKey ?? "",
			RAILWAY_VOLUME_MOUNT_PATH: "/data",
		},
	};

	const pvc: k8s.V1PersistentVolumeClaim = {
		apiVersion: "v1",
		kind: "PersistentVolumeClaim",
		metadata: { name: `${name}-pvc`, namespace: NAMESPACE },
		spec: {
			accessModes: ["ReadWriteOnce"],
			resources: { requests: { storage: "1Gi" } },
		},
	};

	const deploy: k8s.V1Deployment = {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: {
			name,
			namespace: NAMESPACE,
			labels: { app: "xmtp-agent", fid: input.fid },
		},
		spec: {
			replicas: 1,
			selector: { matchLabels: { app: "xmtp-agent", fid: input.fid } },
			template: {
				metadata: { labels: { app: "xmtp-agent", fid: input.fid } },
				spec: {
					containers: [
						{
							name: "agent",
							image: "base-xmtp-xbt:latest",
							imagePullPolicy: "IfNotPresent",
							envFrom: [{ secretRef: { name: `${name}-env` } }],
							volumeMounts: [{ name: "data", mountPath: "/data" }],
						},
					],
					volumes: [
						{
							name: "data",
							persistentVolumeClaim: { claimName: `${name}-pvc` },
						},
					],
				},
			},
		},
	};

	await k8sCore.createNamespacedSecret(NAMESPACE, secret);
	await k8sCore.createNamespacedPersistentVolumeClaim(NAMESPACE, pvc);
	await apps.createNamespacedDeployment(NAMESPACE, deploy);
}

async function deleteAgent(fid: string) {
	const kc = new k8s.KubeConfig();
	kc.loadFromDefault();
	const k8sCore = kc.makeApiClient(k8s.CoreV1Api);
	const apps = kc.makeApiClient(k8s.AppsV1Api);

	const name = `agent-${fid}`;

	try {
		await apps.deleteNamespacedDeployment(name, NAMESPACE);
	} catch {}
	try {
		await k8sCore.deleteNamespacedPersistentVolumeClaim(
			`${name}-pvc`,
			NAMESPACE,
		);
	} catch {}
	try {
		await k8sCore.deleteNamespacedSecret(`${name}-env`, NAMESPACE);
	} catch {}
}

function usageAndExit(): never {
	console.error(
		"Usage: tsx src/provisioner/cli.ts <create|delete> --fid <fid> [--backend-url <url>] [--backend-api-key <key>] [--xmtp-mnemonic <mnemonic>] [--xmtp-env dev|local|production] [--xmtp-db-key <key>]",
	);
	process.exit(1);
}

async function main() {
	const [, , cmd, ...args] = process.argv;
	if (!cmd || (cmd !== "create" && cmd !== "delete")) usageAndExit();

	const arg = (flag: string) => {
		const idx = args.indexOf(flag);
		return idx >= 0 ? args[idx + 1] : undefined;
	};

	if (cmd === "create") {
		const fid = arg("--fid") ?? usageAndExit();
		const backendUrl =
			arg("--backend-url") ?? process.env.BACKEND_URL ?? usageAndExit();
		const backendApiKey =
			arg("--backend-api-key") ?? process.env.BACKEND_API_KEY ?? usageAndExit();
		const xmtpMnemonic =
			arg("--xmtp-mnemonic") ?? process.env.XMTP_MNEMONIC ?? usageAndExit();
		const xmtpEnv = (arg("--xmtp-env") ??
			process.env.XMTP_ENV ??
			"production") as ProvisionInput["xmtpEnv"];
		const xmtpDbKey =
			arg("--xmtp-db-key") ?? process.env.XMTP_DB_ENCRYPTION_KEY ?? undefined;

		await provisionAgent({
			fid,
			backendUrl,
			backendApiKey,
			xmtpMnemonic,
			xmtpEnv,
			xmtpDbKey,
		});
		console.log(`Provisioned agent ${fid}`);
		return;
	}

	if (cmd === "delete") {
		const fid = arg("--fid") ?? usageAndExit();
		await deleteAgent(fid);
		console.log(`Deleted agent ${fid}`);
		return;
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
