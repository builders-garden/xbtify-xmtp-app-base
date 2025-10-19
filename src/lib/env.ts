import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
	// Backend URL
	BACKEND_URL: z.url().min(1),
	BACKEND_API_KEY: z.string().min(1),

	// Fid for the agent
	AGENT_FID: z.string().min(1),

	// XMTP Agent
	XMTP_ENV: z
		.enum(["dev", "local", "production"])
		.optional()
		.default("production"),
	XMTP_MNEMONIC: z.string().min(1),
	XMTP_DB_ENCRYPTION_KEY: z.string().optional(),
	// Fix Railway volume mount path
	RAILWAY_VOLUME_MOUNT_PATH: z.string().optional().default("."),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
