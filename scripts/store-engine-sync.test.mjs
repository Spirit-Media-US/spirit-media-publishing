// node --test scripts/store-engine-sync.test.mjs — src/store-engine/ is the FHB store engine, unedited.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DEST, destOf, FILES, sha } from './sync-store-engine.mjs';

const man = JSON.parse(fs.readFileSync(path.join(DEST, 'MANIFEST.json'), 'utf8'));

test('every engine file matches the manifest sha256 (no hand edits)', () => {
	assert.deepEqual(Object.keys(man.files).sort(), [...FILES].sort());
	for (const f of FILES) assert.equal(sha(fs.readFileSync(destOf(f))), man.files[f], `${destOf(f)} was edited by hand`);
});

test('the copy is current with its FHB source (when the source checkout is on this box)', (t) => {
	if (!fs.existsSync(man.source)) return t.skip(`source ${man.source} not on this machine`);
	for (const f of FILES) {
		const p = path.join(man.source, f);
		assert.ok(fs.existsSync(p), `${p} missing in the FHB source`);
		assert.equal(sha(fs.readFileSync(p)), man.files[f], `${f} changed in FHB: run node scripts/sync-store-engine.mjs`);
	}
});
