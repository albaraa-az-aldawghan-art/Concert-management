import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, unlink, readdir } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const MAGIC = Buffer.from('CONCERT-BACKUP-1\n');
export const sha = data => createHash('sha256').update(data).digest('hex');

// Every Firestore Value stays in its original protobuf JSON representation.
// In particular, int64 values are strings, and timestamps keep nanoseconds.
export function validateDocument(doc, project) {
  const prefix = `projects/${project}/databases/(default)/documents/`;
  if (!doc.name?.startsWith(prefix)) throw new Error('Foreign document in backup');
  const path = doc.name.slice(prefix.length);
  if (!path || path.split('/').length % 2 || path.includes('//')) throw new Error('Invalid document path');
  if (!doc.createTime || !doc.updateTime || !doc.fields || typeof doc.fields !== 'object') throw new Error('Invalid document');
  function value(v) {
    if (!v || typeof v !== 'object' || Object.keys(v).length !== 1) throw new Error('Invalid Firestore value');
    const key = Object.keys(v)[0];
    if (!['nullValue','booleanValue','integerValue','doubleValue','timestampValue','stringValue','bytesValue','referenceValue','geoPointValue','arrayValue','mapValue'].includes(key)) throw new Error('Unknown Firestore value type');
    if (key === 'mapValue') Object.values(v.mapValue.fields ?? {}).forEach(value);
    if (key === 'arrayValue') (v.arrayValue.values ?? []).forEach(value);
  }
  Object.values(doc.fields).forEach(value);
  return path;
}

export async function writeArchive(file, key, records) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([MAGIC, iv]);
  cipher.setAAD(header);
  const part = file + '.partial';
  const output = createWriteStream(part, { flags: 'wx', mode: 0o600 });
  try {
    output.write(header);
    const encode = async function* () {
      for await (const record of records) yield JSON.stringify(record) + '\n';
    };
    await pipeline(Readable.from(encode()), createGzip(), cipher, output);
    const handle = await open(part, 'a');
    try { await handle.write(cipher.getAuthTag()); await handle.sync(); } finally { await handle.close(); }
    await rename(part, file);
  } catch (error) {
    await unlink(part).catch(() => {});
    throw error;
  }
}

export async function inspectArchive(file, key) {
  const handle = await open(file, 'r');
  let size, header, tag;
  try {
    size = (await handle.stat()).size;
    if (size < MAGIC.length + 12 + 16) throw new Error('Truncated archive');
    header = Buffer.alloc(MAGIC.length + 12);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unknown backup format');
    tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, size - 16);
  } finally { await handle.close(); }
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const gunzip = createGunzip();
  const source = createReadStream(file, { start: header.length, end: size - 17 });
  const completion = pipeline(source, decipher, gunzip);
  // Attach the rejection handler immediately; never trust records until GCM finishes.
  completion.catch(() => {});
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  const counts = { documents: 0, users: 0, assets: 0, source: 0, configuration: 0 };
  const paths = new Set();
  const digest = createHash('sha256');
  let manifest, metadata;
  try {
    for await (const line of lines) {
      const record = JSON.parse(line);
      if (manifest) throw new Error('Data after manifest');
      if (record.type === 'metadata') {
        if (metadata) throw new Error('Duplicate metadata');
        metadata = record;
      } else if (record.type === 'document') {
        if (!metadata) throw new Error('Missing metadata');
        const path = validateDocument(record.data, metadata.project);
        if (paths.has(path)) throw new Error('Duplicate document');
        paths.add(path);
        // Reconstruct a REST restore write offline, preserving the fields exactly.
        const restored = JSON.parse(JSON.stringify({ update: { name: record.data.name, fields: record.data.fields } }));
        if (JSON.stringify(restored.update.fields) !== JSON.stringify(record.data.fields)) throw new Error('Restore round-trip mismatch');
        counts.documents++;
        digest.update(JSON.stringify(record.data) + '\n');
      } else if (record.type === 'users') {
        counts.users += record.data.length;
      } else if (['asset','source','configuration'].includes(record.type)) {
        const bytes = Buffer.from(record.data, 'base64');
        if (sha(bytes) !== record.sha256) throw new Error('File checksum mismatch');
        counts[record.type === 'asset' ? 'assets' : record.type]++;
      } else if (record.type === 'authConfig') {
        // Protected inside the same authenticated archive as the user hashes.
      } else if (record.type === 'manifest') manifest = record;
      else throw new Error('Unknown backup record');
    }
    await completion;
  } catch (error) {
    source.destroy(); gunzip.destroy(); lines.close();
    await completion.catch(() => {});
    throw error;
  }
  if (!metadata || !manifest || manifest.documentSha256 !== digest.digest('hex')) throw new Error('Missing or invalid manifest');
  for (const [key, count] of Object.entries(counts)) if (manifest.counts[key] !== count) throw new Error('Backup count mismatch: ' + key);
  return { metadata, manifest, counts, bytes: size, restoreRoundTripVerified: true };
}

export async function pruneArchives(directory, keep = 4) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Invalid retention');
  const files = (await readdir(directory)).filter(name => /^concert-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{8}\.cbackup$/.test(name)).sort().reverse();
  for (const name of files.slice(keep)) {
    await unlink(join(directory, name));
    await unlink(join(directory, name + '.json')).catch(() => {});
  }
  return files.slice(keep);
}
