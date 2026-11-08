import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { writeArchive, inspectArchive, pruneArchives } from './core.mjs';

const document = { name: 'projects/test-project/databases/(default)/documents/a/one/b/two', createTime: '2026-01-01T00:00:00Z', updateTime: '2026-01-01T00:00:00.123456789Z', fields: { number: { integerValue: '9223372036854775807' }, decimal: { doubleValue: 1234.56 }, date: { timestampValue: '2026-01-01T00:00:00.123456789Z' }, zero: { integerValue: '0' }, nil: { nullValue: null }, arabic: { stringValue: 'اختبار' }, nested: { mapValue: { fields: { array: { arrayValue: { values: [{ booleanValue: false }, { bytesValue: 'AQI=' }, { referenceValue: 'projects/test-project/databases/(default)/documents/a/one' }, { geoPointValue: { latitude: 24.7, longitude: 46.6 } }] } } } } } } };
function records() {
  const data = Buffer.from('file-content');
  return [ { type: 'metadata', project: 'test-project' }, { type: 'document', data: document }, { type: 'users', data: [{ uid: 'one', passwordHash: 'hash', passwordSalt: '' }] }, { type: 'asset', data: data.toString('base64'), sha256: createHash('sha256').update(data).digest('hex') }, { type: 'manifest', counts: { documents: 1, users: 1, assets: 1, source: 0, configuration: 0 }, documentSha256: createHash('sha256').update(JSON.stringify(document) + '\n').digest('hex'), warnings: [] } ];
}
test('encrypted round trip preserves exact Firestore values; wrong key and tampering rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concert-backup-test-'));
  try {
    const file = join(dir, 'test.cbackup'), key = randomBytes(32);
    await writeArchive(file, key, records());
    const raw = await readFile(file);
    assert.equal(raw.includes(Buffer.from('file-content')), false);
    assert.equal(raw.includes(Buffer.from('passwordHash')), false);
    const result = await inspectArchive(file, key);
    assert.equal(result.counts.documents, 1); assert.equal(result.restoreRoundTripVerified, true);
    await assert.rejects(inspectArchive(file, randomBytes(32)));
    raw[raw.length - 20] ^= 1;
    await writeFile(file, raw);
    await assert.rejects(inspectArchive(file, key));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('failed generation removes partial output; no complete backup is published', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concert-backup-test-'));
  try {
    async function* failure() { yield { type: 'metadata' }; throw new Error('quota'); }
    await assert.rejects(writeArchive(join(dir, 'failed.cbackup'), randomBytes(32), failure()));
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('missing manifest, duplicated document, wrong count, and foreign project rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concert-backup-test-'));
  try {
    const variants = [records().slice(0, -1), [...records().slice(0, 2), records()[1], ...records().slice(2)], records().map(r => r.type === 'manifest' ? { ...r, counts: { ...r.counts, documents: 2 } } : r), records().map(r => r.type === 'metadata' ? { ...r, project: 'another' } : r)];
    for (let i = 0; i < variants.length; i++) {
      const key = randomBytes(32), file = join(dir, i + '.cbackup');
      await writeArchive(file, key, variants[i]); await assert.rejects(inspectArchive(file, key));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('retention keeps four newest archives without touching unrelated or partial files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concert-backup-test-'));
  try {
    for (let i = 1; i <= 6; i++) await writeFile(join(dir, `concert-2026-11-0${i}T03-00-00-000Z-abcdef12.cbackup`), 'test');
    await writeFile(join(dir, 'notes.txt'), 'keep'); await writeFile(join(dir, 'unfinished.partial'), 'keep');
    const removed = await pruneArchives(dir, 4);
    assert.equal(removed.length, 2);
    const files = await readdir(dir);
    assert.equal(files.length, 6); assert.ok(files.includes('notes.txt')); assert.ok(files.includes('unfinished.partial'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
