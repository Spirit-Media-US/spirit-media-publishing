// node --test scripts/store-engine-sync.test.mjs — src/store-engine/ is the store engine's MASTER (Kevin 2026-11-16
// "1 store SMP"); every file matches the manifest FHB's copy is checked against. Edit the engine, then
// node scripts/sync-store-engine.mjs to re-stamp the manifest, commit both.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { destOf, FILES, MANIFEST, manifestOf, offManifest } from './sync-store-engine.mjs';

const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

test('every engine file matches the manifest sha256 (stamped after each edit)', () => {
	assert.deepEqual(Object.keys(man.files).sort(), [...FILES].sort());
	assert.deepEqual(offManifest(man, destOf), [], 'run node scripts/sync-store-engine.mjs and commit the manifest');
});

test('the manifest is exactly what the stamp writes (no hand-edited manifest)', () => {
	assert.equal(fs.readFileSync(MANIFEST, 'utf8'), manifestOf(man.files));
});

test('the check refuses a drifted file (failure path)', () => {
	const f = FILES[0];
	assert.deepEqual(offManifest({ files: { ...man.files, [f]: '0'.repeat(64) } }, destOf), [destOf(f)]);
});
