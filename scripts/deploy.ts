import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import SftpClient from 'ssh2-sftp-client';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config();

const REQUIRED_ENV = ['SFTP_HOST', 'SFTP_USER', 'SFTP_PASSWORD', 'SFTP_REMOTE_PATH'] as const;

function getEnv(): Record<(typeof REQUIRED_ENV)[number], string> {
	const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
	if (missing.length > 0) {
		console.error(`\n❌  Missing required environment variables:\n   ${missing.join(', ')}`);
		console.error('   Copy .env.example → .env and fill in your values.\n');
		process.exit(1);
	}
	return Object.fromEntries(REQUIRED_ENV.map((k) => [k, process.env[k] as string])) as Record<
		(typeof REQUIRED_ENV)[number],
		string
	>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIST_DIR = path.resolve(process.cwd(), 'dist');

function assertDistExists(): void {
	if (!fs.existsSync(DIST_DIR)) {
		console.error('\n❌  dist/ directory not found. Run `bun run build` first.\n');
		process.exit(1);
	}
}

function formatPath(filePath: string): string {
	// Show only the relative portion for tidy progress output
	return path.relative(DIST_DIR, filePath) || filePath;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function deploy(): Promise<void> {
	const env = getEnv();
	assertDistExists();

	const sftp = new SftpClient('spirit-media-deploy');
	let uploadCount = 0;

	console.log(`\n🚀  Deploying dist/ → ${env.SFTP_HOST}${env.SFTP_REMOTE_PATH}\n`);

	// Progress: fires once per file after it has been transferred
	sftp.client.on('upload', (info: { source: string; destination: string }) => {
		uploadCount++;
		console.log(`   ✔  ${formatPath(info.source)}`);
	});

	try {
		// Connect
		console.log(`🔌  Connecting to ${env.SFTP_HOST}…`);
		await sftp.connect({
			host: env.SFTP_HOST,
			username: env.SFTP_USER,
			password: env.SFTP_PASSWORD,
		});
		console.log('   Connected.\n');

		// Ensure the remote root exists
		console.log(`📁  Ensuring remote path exists: ${env.SFTP_REMOTE_PATH}`);
		await sftp.mkdir(env.SFTP_REMOTE_PATH, true);

		// Upload
		console.log('📤  Uploading files…\n');
		await sftp.uploadDir(DIST_DIR, env.SFTP_REMOTE_PATH);

		console.log(`\n✅  Done — ${uploadCount} file${uploadCount === 1 ? '' : 's'} uploaded.\n`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`\n❌  Deploy failed: ${message}\n`);
		process.exit(1);
	} finally {
		await sftp.end();
	}
}

deploy();
