import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';

export interface StartedE2EServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startE2EServer(): Promise<StartedE2EServer> {
  const serverScript = resolve(process.cwd(), 'tests/e2e-web/start-test-server.mts');
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    ['--import', 'tsx', serverScript],
    {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  const baseUrl = await new Promise<string>((resolveUrl, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const timeout = setTimeout(() => {
      reject(new Error(`E2E server timed out. stderr: ${stderrBuffer}`));
    }, 10000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      const match = stdoutBuffer.match(/E2E_SERVER_URL=(http:\/\/[^\r\n]+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolveUrl(match[1]);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`E2E server exited early (${code}). stderr: ${stderrBuffer}`));
    });
  });

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }

      await new Promise<void>((resolveStop) => {
        child.once('exit', () => resolveStop());
        child.stdin.end();
        child.kill();
      });
    },
  };
}
