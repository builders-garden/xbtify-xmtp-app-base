import k8s from "@kubernetes/client-node";
import express from "express";

const app = express();
app.use(express.json());

const NAMESPACE = "xmtp-agents";

app.post("/provision", async (req, res) => {
	try {
		const {
			fid,
			backendUrl,
			backendApiKey,
			xmtpMnemonic,
			xmtpPrivateKey,
			xmtpEnv = "production",
			xmtpDbKey,
		} = req.body ?? {};

		if (
			!fid ||
			!backendUrl ||
			!backendApiKey ||
			(!xmtpMnemonic && !xmtpPrivateKey) ||
			(xmtpMnemonic && xmtpPrivateKey)
		) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();
		const k8sCore = kc.makeApiClient(k8s.CoreV1Api);
		const apps = kc.makeApiClient(k8s.AppsV1Api);

		const name = `agent-${fid}`;

		const secret: k8s.V1Secret = {
			apiVersion: "v1",
			kind: "Secret",
			metadata: { name: `${name}-env`, namespace: NAMESPACE },
			stringData: {
				BACKEND_URL: backendUrl,
				BACKEND_API_KEY: backendApiKey,
				AGENT_FID: String(fid),
				XMTP_MNEMONIC: xmtpMnemonic,
				XMTP_PRIVATE_KEY: xmtpPrivateKey,
				XMTP_ENV: xmtpEnv,
				XMTP_DB_ENCRYPTION_KEY: xmtpDbKey ?? "",
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
				labels: { app: "xmtp-agent", fid: String(fid) },
			},
			spec: {
				replicas: 1,
				selector: { matchLabels: { app: "xmtp-agent", fid: String(fid) } },
				template: {
					metadata: { labels: { app: "xmtp-agent", fid: String(fid) } },
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

		return res.json({ status: "ok", fid });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: "Provisioning failed" });
	}
});

app.post("/deprovision", async (req, res) => {
	try {
		const { fid } = req.body ?? {};
		if (!fid) return res.status(400).json({ error: "Missing fid" });
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
		return res.json({ status: "ok", fid });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: "Deprovisioning failed" });
	}
});

// Generic payment webhook that triggers provisioning on successful payment
// Expected body example:
// {
//   "type": "payment_succeeded",
//   "data": {
//     "fid": "12345",
//     "backendUrl": "https://backend.example",
//     "backendApiKey": "sk_test_xxx",
//     "xmtpMnemonic": "word1 word2 ...",
//     "xmtpEnv": "dev",
//     "xmtpDbKey": "optional-64-hex"
//   }
// }
app.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body ?? {};
		if (type !== "payment_succeeded")
			return res.status(400).json({ error: "Unsupported event" });

		const {
			fid,
			backendUrl,
			backendApiKey,
			xmtpMnemonic,
			xmtpPrivateKey,
			xmtpEnv = "production",
			xmtpDbKey,
		} = data ?? {};
		if (!fid || !backendUrl || !backendApiKey || !xmtpMnemonic) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();
		const k8sCore = kc.makeApiClient(k8s.CoreV1Api);
		const apps = kc.makeApiClient(k8s.AppsV1Api);

		const name = `agent-${fid}`;

		const secret: k8s.V1Secret = {
			apiVersion: "v1",
			kind: "Secret",
			metadata: { name: `${name}-env`, namespace: NAMESPACE },
			stringData: {
				BACKEND_URL: String(backendUrl),
				BACKEND_API_KEY: String(backendApiKey),
				AGENT_FID: String(fid),
				XMTP_MNEMONIC: String(xmtpMnemonic),
				XMTP_PRIVATE_KEY: String(xmtpPrivateKey),
				XMTP_ENV: String(xmtpEnv),
				XMTP_DB_ENCRYPTION_KEY: xmtpDbKey ? String(xmtpDbKey) : "",
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
				labels: { app: "xmtp-agent", fid: String(fid) },
			},
			spec: {
				replicas: 1,
				selector: { matchLabels: { app: "xmtp-agent", fid: String(fid) } },
				template: {
					metadata: { labels: { app: "xmtp-agent", fid: String(fid) } },
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

		return res.json({ status: "ok", fid });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: "Webhook processing failed" });
	}
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
	console.log(`Provisioner listening on port ${PORT}`);
});
