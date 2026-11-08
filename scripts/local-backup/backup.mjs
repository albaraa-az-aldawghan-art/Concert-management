import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, open, unlink, rename, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { sha, writeArchive, inspectArchive, pruneArchives } from './core.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ps = (code, input = '') => {
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',code], { input, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Windows encryption operation failed');
  return result.stdout.trim();
};
const protect = bytes => Buffer.from(ps('Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))', bytes.toString('base64')), 'base64');
const unprotect = bytes => Buffer.from(ps('Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))', bytes.toString('base64')), 'base64');
const documents = ps('[Environment]::GetFolderPath("MyDocuments")');
const root = join(documents, 'Concert-Backups');
const settingsFile = join(root, 'settings.json');
const command = process.argv[2] ?? 'run';
const atomicJson = async (file, data) => {
  await writeFile(file + '.partial', JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(file + '.partial', file);
};

async function init() {
  if (process.platform !== 'win32') throw new Error('Windows is required');
  await mkdir(root, { recursive: true });
  // Restrict access to this Windows account and SYSTEM; no recursive shell operations.
  const sid = ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
  const result = spawnSync('icacls.exe', [root, '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '/inheritance:r'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Cannot protect backup folder permissions');
  try { await stat(settingsFile); console.log(JSON.stringify({ initialized: true, alreadyExists: true, directory: root })); return; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  process.loadEnvFile(join(repo, '.env.local'));
  const credentials = { project_id: process.env.FIREBASE_ADMIN_PROJECT_ID, client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n') };
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw new Error('Missing Firebase credentials');
  await writeFile(join(root, 'key.dpapi'), protect(randomBytes(32)), { flag: 'wx', mode: 0o600 });
  await writeFile(join(root, 'credentials.dpapi'), protect(Buffer.from(JSON.stringify(credentials))), { flag: 'wx', mode: 0o600 });
  await atomicJson(settingsFile, { format: 1, project: credentials.project_id, keep: 4, maxDocuments: 20000, maxAssets: 1000, maxAssetBytes: 20 * 1024 * 1024, maxTotalAssetBytes: 500 * 1024 * 1024, day: 'Sunday', time: '12:00', timezone: 'Asia/Riyadh' });
  console.log(JSON.stringify({ initialized: true, directory: root }));
}

async function run() {
  const lockFile = join(root, 'running.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const info = JSON.parse(await readFile(lockFile, 'utf8').catch(() => '{}'));
    let alive = false;
    if (Number.isInteger(info.pid)) { try { process.kill(info.pid, 0); alive = true; } catch {} }
    if (alive) throw new Error('A backup is already running');
    await unlink(lockFile);
    lock = await open(lockFile, 'wx');
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
    const credentials = JSON.parse(unprotect(await readFile(join(root, 'credentials.dpapi'))).toString());
    const key = unprotect(await readFile(join(root, 'key.dpapi')));
    if (settings.project !== credentials.project_id || key.length !== 32) throw new Error('Invalid backup configuration');
    const client = await new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
    const request = async (url, data) => {
      // Daily free-tier exhaustion must not trigger repeated reads on the live app.
      const r = await client.request({ url, ...(data ? { method: 'POST', data } : {}), timeout: 45000, retry: true, retryConfig: { retry: 2, statusCodesToRetry: [[500,599]] } });
      return r.data;
    };
    const project = settings.project;
    const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
    const startedAt = new Date().toISOString();
    const readTime = new Date(Date.now() - 5000).toISOString();
    const counts = { documents: 0, users: 0, assets: 0, source: 0, configuration: 0 };
    const warnings = [];
    const collections = {};
    const urls = new Set();
    const documentDigest = createHash('sha256');
    let requestCount = 0, missingParents = 0, assetsBytes = 0;
    const timeoutCheck = () => {
      if (Date.now() - Date.parse(readTime) > 45 * 60 * 1000) throw new Error('Snapshot time limit reached; no complete backup published');
      if (++requestCount > 60000) throw new Error('Backup request safety limit exceeded');
    };
    async function collectionIds(parent) {
      const ids = []; let pageToken;
      do {
        timeoutCheck();
        const data = await request(parent + ':listCollectionIds', { pageSize: 1000, readTime, ...(pageToken ? { pageToken } : {}) });
        ids.push(...(data.collectionIds ?? [])); pageToken = data.nextPageToken;
      } while (pageToken);
      return ids.sort();
    }
    const safeAsset = text => {
      try {
        const u = new URL(text);
        if (u.protocol !== 'https:') return false;
        return u.hostname === 'res.cloudinary.com' || u.hostname === 'firebasestorage.googleapis.com' || u.hostname === 'storage.googleapis.com';
      } catch { return false; }
    };
    function findUrls(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.stringValue === 'string' && safeAsset(value.stringValue)) urls.add(value.stringValue);
      if (value.mapValue) Object.values(value.mapValue.fields ?? {}).forEach(findUrls);
      if (value.arrayValue) (value.arrayValue.values ?? []).forEach(findUrls);
    }
    // Use a small bounded worker pool for collection discovery, including missing parents.
    async function childrenFor(docs) {
      const results = new Array(docs.length); let index = 0;
      await Promise.all(Array.from({ length: Math.min(16, docs.length) }, async () => {
        while (index < docs.length) { const i = index++; results[i] = await collectionIds('https://firestore.googleapis.com/v1/' + docs[i].name); }
      }));
      return results;
    }
    async function* records() {
      yield { type: 'metadata', format: 1, project, database: '(default)', startedAt, readTime, encryption: 'AES-256-GCM', consistency: 'Firestore fixed readTime; Auth and assets captured during run' };
      const queue = (await collectionIds(base)).map(id => ({ parent: base, id, path: id }));
      const visited = new Set();
      while (queue.length) {
        const collection = queue.shift();
        if (visited.has(collection.path)) throw new Error('Duplicate collection traversal');
        visited.add(collection.path); collections[collection.path] = 0;
        let pageToken;
        do {
          timeoutCheck();
          const budget = settings.maxDocuments - counts.documents;
          if (budget <= 0) throw new Error('Document safety limit reached; no complete backup published');
          const url = new URL(collection.parent + '/' + encodeURIComponent(collection.id));
          url.searchParams.set('pageSize', String(Math.min(250, budget)));
          url.searchParams.set('showMissing', 'true'); url.searchParams.set('readTime', readTime);
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const data = await request(url.href);
          const docs = data.documents ?? [];
          for (const doc of docs) {
            if (doc.createTime && doc.updateTime) {
              // Empty existing documents may omit the fields map in the REST response.
              doc.fields ??= {};
              counts.documents++; collections[collection.path]++;
              if (counts.documents > settings.maxDocuments) throw new Error('Document limit exceeded');
              Object.values(doc.fields).forEach(findUrls);
              documentDigest.update(JSON.stringify(doc) + '\n');
              yield { type: 'document', data: doc };
            } else missingParents++;
          }
          const children = await childrenFor(docs);
          for (let i = 0; i < docs.length; i++) for (const id of children[i]) queue.push({ parent: 'https://firestore.googleapis.com/v1/' + docs[i].name, id, path: docs[i].name.split('/documents/')[1] + '/' + id });
          pageToken = data.nextPageToken;
        } while (pageToken);
        console.log(JSON.stringify({ progress: 'firestore', completedCollections: visited.size, documents: counts.documents }));
      }
      const app = initializeApp({ credential: cert({ projectId: project, clientEmail: credentials.client_email, privateKey: credentials.private_key }) }, 'local-backup-' + process.pid);
      let token, passwordUsers = 0, hashUsers = 0;
      do {
        const result = await getAuth(app).listUsers(1000, token);
        const users = result.users.map(u => u.toJSON());
        for (const u of users) {
          if (u.providerData?.some(p => p.providerId === 'password')) { passwordUsers++; if (u.passwordHash && u.passwordSalt !== undefined) hashUsers++; }
        }
        counts.users += users.length;
        yield { type: 'users', data: users };
        token = result.pageToken;
      } while (token);
      let hashConfigAvailable = false;
      try {
        const config = await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
        hashConfigAvailable = !!config.hashConfig;
        yield { type: 'authConfig', data: config };
      } catch { warnings.push({ component: 'authentication', reason: 'Auth project configuration unavailable; password restoration may require reset' }); }
      if (passwordUsers > hashUsers || (passwordUsers > 0 && !hashConfigAvailable)) warnings.push({ component: 'authentication', reason: 'Password hashes or hash parameters unavailable; accounts included but password reset may be necessary', passwordUsers, hashUsers });
      const buckets = await request(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(project)}`);
      if ((buckets.items ?? []).length) throw new Error('Storage buckets detected: extend object backup before marking this backup complete');
      const knownAssets = [...urls].sort();
      if (knownAssets.length > settings.maxAssets) throw new Error('Asset count safety limit exceeded');
      for (const url of knownAssets) {
        try {
          const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          if (Number(response.headers.get('content-length') ?? 0) > settings.maxAssetBytes) throw new Error('Asset exceeds size limit');
          const chunks = []; let length = 0;
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > settings.maxAssetBytes || assetsBytes + length > settings.maxTotalAssetBytes) throw new Error('Asset size safety limit exceeded');
            chunks.push(chunk);
          }
          const bytes = Buffer.concat(chunks); assetsBytes += length; counts.assets++;
          yield { type: 'asset', url, sha256: sha(bytes), contentType: response.headers.get('content-type'), data: bytes.toString('base64') };
        } catch (e) { warnings.push({ component: 'asset', urlSha256: sha(url), reason: String(e.message).slice(0, 160) }); }
      }
      const archive = spawnSync('git', ['archive','--format=zip','HEAD'], { cwd: repo, maxBuffer: 150 * 1024 * 1024, windowsHide: true });
      if (archive.status !== 0) throw new Error('Source code archive failed');
      counts.source++;
      yield { type: 'source', name: 'source.zip', sha256: sha(archive.stdout), data: archive.stdout.toString('base64') };
      for (const name of ['backup.mjs','core.mjs','run.ps1','install-task.ps1','README.md']) {
        const data = await readFile(join(repo, 'scripts/local-backup', name)); counts.source++;
        yield { type: 'source', name: 'backup-tool/' + name, sha256: sha(data), data: data.toString('base64') };
      }
      const env = await readFile(join(repo, '.env.local'));
      counts.configuration++;
      yield { type: 'configuration', name: '.env.local', sha256: sha(env), data: env.toString('base64') };
      const sourceStatus = spawnSync('git', ['status','--porcelain','--untracked-files=no'], { cwd: repo, encoding: 'utf8', windowsHide: true });
      if (sourceStatus.stdout.trim()) warnings.push({ component: 'source', reason: 'Git source archive contains committed HEAD; uncommitted code changes are not included' });
      const head = spawnSync('git', ['rev-parse','HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true }).stdout.trim();
      yield { type: 'manifest', completedAt: new Date().toISOString(), counts, collections, missingParents, documentSha256: documentDigest.digest('hex'), warnings, assetReferences: knownAssets.length, assetsBytes, sourceCommit: head, auth: { passwordUsers, hashUsers, hashConfigAvailable }, limitations: ['Auth and external assets are not a single atomic snapshot', 'Only referenced external assets are copied; unused Cloudinary assets are outside this backup', 'Hosting provider settings and third-party service accounts are not exported'] };
    }
    const stamp = startedAt.replace(/[:.]/g, '-');
    const file = join(root, `concert-${stamp}-${randomBytes(4).toString('hex')}.cbackup`);
    await writeArchive(file, key, records());
    let result;
    try { result = await inspectArchive(file, key); }
    catch (e) { await rename(file, file + '.unverified'); throw e; }
    const summary = { status: result.manifest.warnings.length ? 'success_with_warnings' : 'success', completedAt: result.manifest.completedAt, readTime, file, bytes: result.bytes, counts: result.counts, warnings: result.manifest.warnings, auth: result.manifest.auth, restoreRoundTripVerified: true };
    await atomicJson(file + '.json', summary);
    await atomicJson(join(root, 'last-status.json'), summary);
    const removed = await pruneArchives(root, settings.keep);
    console.log(JSON.stringify({ ...summary, removedOldBackups: removed.length }));
  } catch (error) {
    await atomicJson(join(root, 'last-status.json'), { status: 'failed', failedAt: new Date().toISOString(), error: 'Backup did not complete. Existing verified backups have been preserved.', detail: error.code ?? error.response?.status ?? error.message?.slice(0, 180), serviceMessage: error.response?.data?.error?.message?.slice(0, 180) });
    throw error;
  } finally { await lock.close(); await unlink(lockFile).catch(() => {}); }
}

try {
  if (command === 'init') await init();
  else if (command === 'run') await run();
  else if (command === 'self-test') {
    const tests = spawnSync(process.execPath, ['--test', join(repo, 'scripts/local-backup/core.test.mjs')], { encoding: 'utf8', windowsHide: true });
    if (tests.status !== 0) throw new Error('Backup core tests failed');
    const key = unprotect(await readFile(join(root, 'key.dpapi')));
    const file = join(root, 'self-test-' + randomBytes(8).toString('hex') + '.test');
    const data = { name: 'projects/self-test/databases/(default)/documents/test/one', fields: { amount: { doubleValue: 1234.56 }, exact: { integerValue: '9223372036854775807' }, when: { timestampValue: '2026-01-01T00:00:00.123456789Z' } }, createTime: '2026-01-01T00:00:00Z', updateTime: '2026-01-01T00:00:00Z' };
    try {
      await writeArchive(file, key, [{ type: 'metadata', project: 'self-test' }, { type: 'document', data }, { type: 'manifest', counts: { documents: 1, users: 0, assets: 0, source: 0, configuration: 0 }, documentSha256: sha(JSON.stringify(data) + '\n'), warnings: [] }]);
      await inspectArchive(file, key);
      const receipt = { passed: true, tests: 4, windowsKeyRoundTrip: true, offlineRestoreFormatVerified: true, completedAt: new Date().toISOString() };
      await atomicJson(join(root, 'self-test.json'), receipt);
      console.log(JSON.stringify(receipt));
    } finally { await unlink(file).catch(() => {}); }
  } else if (command === 'verify') {
    const file = resolve(process.argv[3] ?? '');
    const key = unprotect(await readFile(join(root, 'key.dpapi')));
    const result = await inspectArchive(file, key);
    console.log(JSON.stringify({ verified: true, counts: result.counts, bytes: result.bytes, restoreRoundTripVerified: result.restoreRoundTripVerified, warnings: result.manifest.warnings }));
  } else throw new Error('Use init, run, self-test, or verify <file>');
} catch (error) {
  console.error(JSON.stringify({ failed: true, reason: error.code ?? error.response?.status ?? error.message?.slice(0, 180) }));
  process.exitCode = 1;
}
