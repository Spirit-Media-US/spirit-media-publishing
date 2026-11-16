// BUILD-CHECK: searched tool-inventory.py "llms" (nothing) + FHB scripts/llms-answer-pages.test.mjs
// NEAREST: /srv/sites/FHB/scripts/llms-answer-pages.test.mjs
// NOT-REUSED-BECAUSE: it tests FHB's answer-page block in the FHB repo; SMP's live book list is a different source
// APPROVED-BY: pmseoaeo brief pmprint-smp-growth-20261116 #1 ("test that every live page is listed")
//
// node --test scripts/llms-books.test.mjs — every live /books/<slug>/ page is listed in llms.txt AND llms-full.txt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { apply, BEGIN, collect, END, FILES, liveSlugs, missing, render } from './llms-books.mjs';

const slugs = liveSlugs();

for (const name of FILES) {
	test(`public/${name} lists every live book page (${slugs.length})`, () => {
		const text = fs.readFileSync(`public/${name}`, 'utf8');
		assert.deepEqual(missing(text, slugs), [], 'run node scripts/llms-books.mjs');
		assert.equal(text.split(BEGIN).length, 2, 'exactly one generated block');
	});
	test(`dist/${name} (the built file) lists every live book page`, (t) => {
		if (!fs.existsSync(`dist/${name}`)) return t.skip('no dist build');
		assert.deepEqual(missing(fs.readFileSync(`dist/${name}`, 'utf8'), slugs), []);
	});
}

test('every live page has a one-line description', () => {
	for (const e of collect())
		assert.ok(e.description.length >= 40, `${e.slug} description too short`);
});

test('the check FAILS when a live page is dropped (proof the gate can reject)', () => {
	const text = apply('# x\n\n## Contact\n', render(collect()));
	assert.deepEqual(missing(text, slugs), []);
	const dropped = text.replace(new RegExp(`^- /books/${slugs[0]}/ — .*\\n`, 'm'), '');
	assert.deepEqual(missing(dropped, slugs), [slugs[0]]);
});

test('apply() is idempotent (replaces its block, never duplicates)', () => {
	const once = apply('# x\n\n## Contact\nfoo\n', render(collect()));
	assert.equal(apply(once, render(collect())), once);
	assert.ok(once.indexOf(END) < once.indexOf('## Contact'));
});
