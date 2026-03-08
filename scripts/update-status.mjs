/**
 * update-status.mjs
 * Auto-updates PROJECT-STATUS.md with live Sanity document counts
 * and today's date. Runs automatically via lefthook pre-push hook.
 *
 * To run manually: node scripts/update-status.mjs
 */

import { createClient } from '@sanity/client';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = join(__dirname, '..', 'PROJECT-STATUS.md');

const client = createClient({
  projectId: 'pmowd8uo',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-01-01',
});

const TYPES = [
  { type: 'testimonial',    note: 'Live on homepage, fetched from Sanity' },
  { type: 'teamMember',     note: 'Live on about page, fetched from Sanity' },
  { type: 'pressRelease',   note: 'Live on media-center, fetched from Sanity' },
  { type: 'mediaVideo',     note: 'YouTube IDs/titles only, no video files in Sanity' },
  { type: 'portfolioVideo', note: 'YouTube embed URLs' },
  { type: 'blogPost',       note: 'Fully dynamic via [slug].astro' },
  { type: 'book',           note: 'Fully dynamic on /bookstore' },
  { type: 'siteSettings',   note: 'phone, email, socials, siteName, tagline, description' },
];

async function run() {
  console.log('📊 Fetching Sanity document counts...');

  const counts = await Promise.all(
    TYPES.map(async ({ type, note }) => {
      const count = await client.fetch(`count(*[_type == "${type}"])`);
      console.log(`  ${type}: ${count}`);
      return { type, count, note };
    })
  );

  const today = new Date().toISOString().slice(0, 10);
  const tableRows = counts
    .map(({ type, count, note }) => `| ${type} | ${count} | ${note} |`)
    .join('\n');

  const newTable = `## Sanity Document Counts (as of ${today})
| Type | Count | Notes |
|---|---|---|
${tableRows}`;

  let content = readFileSync(STATUS_FILE, 'utf8');

  // Update the "Last updated" date
  content = content.replace(
    /> Last updated: .+/,
    `> Last updated: ${today}`
  );

  // Replace the entire Sanity Document Counts section
  content = content.replace(
    /## Sanity Document Counts[\s\S]*?(?=\n---|\n## )/,
    newTable + '\n\n'
  );

  writeFileSync(STATUS_FILE, content);
  console.log(`✅ PROJECT-STATUS.md updated (${today})`);
}

run().catch((err) => {
  console.error('❌ update-status failed:', err.message);
  // Non-zero exit would block the push — we warn but don't block
  process.exit(0);
});
