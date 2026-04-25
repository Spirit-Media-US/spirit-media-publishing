// Pre-build sync: fetch the canonical 100 Club registry from R2 and write it
// to src/data/100club-sites.json. The HundredClubBadge component reads this
// file to decide whether to render. If the fetch fails (network, R2 outage),
// the existing local copy is left in place — build never blocks on this.
import fs from 'node:fs';

const URL = 'https://assets.spiritmediapublishing.com/100club-sites.json';
const TARGET = 'src/data/100club-sites.json';

try {
  const res = await fetch(URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Registry payload is not an array');
  fs.mkdirSync('src/data', { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(data, null, 2));
  console.log(`✓ Synced 100 Club registry (${data.length} sites)`);
} catch (err) {
  console.warn(`⚠ 100 Club registry sync failed: ${err.message} — using local copy`);
  if (!fs.existsSync(TARGET)) {
    fs.mkdirSync('src/data', { recursive: true });
    fs.writeFileSync(TARGET, '[]');
  }
}
