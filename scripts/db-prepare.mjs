import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  await mkdir('data', { recursive: true });
  await run('npx', ['prisma', 'migrate', 'deploy']);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
