import { createClient } from '@sanity/client';
import { config } from 'dotenv';

config({ path: '/home/deploy/bin/.env' });

const client = createClient({
  projectId: 'pmowd8uo',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-01-01',
});

try {
  const result = await client.fetch('*[_type == "siteSettings"][0]');
  console.log('Current siteSettings:', JSON.stringify(result, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
