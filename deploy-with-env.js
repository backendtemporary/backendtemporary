#!/usr/bin/env node
/**
 * Deploy to Elastic Beanstalk including your local .env file.
 * Use this when you can't set environment variables in the EB console.
 *
 * Run from backend folder: node deploy-with-env.js
 */
import { mkdtemp, cp, rm, readdir, stat, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const backendDir = process.cwd();
const envPath = join(backendDir, '.env');

if (!existsSync(envPath)) {
  console.error('No .env file in backend. Create one with DB_* and JWT_SECRET.');
  process.exit(1);
}

async function copyRecursive(src, dest) {
  const st = await stat(src);
  if (st.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(src)) {
      if (name === 'node_modules' || name === '.git') continue;
      await copyRecursive(join(src, name), join(dest, name));
    }
  } else {
    await cp(src, dest);
  }
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'eb-deploy-'));
  console.log('Building deploy bundle (including .env) in', tempDir);

  try {
    await copyRecursive(backendDir, tempDir);
    console.log('Running npm install --production...');
    execSync('npm install --production', { cwd: tempDir, stdio: 'inherit', shell: true });
    console.log('Running eb deploy...');
    execSync('eb deploy', { cwd: tempDir, stdio: 'inherit', shell: true });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
