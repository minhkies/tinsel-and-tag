// probe-db.cjs — TEMPORARY diagnostic script (safe to delete)
// Reads .env.local WITHOUT printing any secrets, then checks the
// wishlist_items table schema and reproduces the addWishlistItem insert.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars in .env.local');
  process.exit(1);
}

console.log('DB host:', new URL(env.NEXT_PUBLIC_SUPABASE_URL).host);

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROBE_TITLE = '__claude_probe_delete_me__';

async function main() {
  // 0. Which tables are exposed by PostgREST?
  const rootRes = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const rootBody = await rootRes.json();
  console.log(
    '[0] exposed tables:',
    Array.isArray(rootBody?.definitions)
      ? Object.keys(rootBody.definitions).join(', ')
      : JSON.stringify(rootBody).slice(0, 200)
  );

  // 1. select * sample to see actual columns
  const { data: sample, error: e1 } = await client.from('wishlist_items').select('*').limit(1);
  console.log(
    '\n[1] select *:',
    e1
      ? `ERROR ${e1.code}: ${e1.message}`
      : `OK — columns: ${sample?.length ? Object.keys(sample[0]).join(', ') : '(table empty, no sample row)'}`
  );

  // 2. can we select the position column?
  const { error: e2 } = await client.from('wishlist_items').select('id, position').limit(1);
  console.log('[2] select position:', e2 ? `ERROR ${e2.code}: ${e2.message}` : 'OK');

  // 3. grab a real participant for FK-satisfying inserts
  const { data: parts, error: e3 } = await client.from('participants').select('id, name').limit(3);
  console.log(
    '[3] participants:',
    e3
      ? `ERROR ${e3.code}: ${e3.message}`
      : `${parts?.length} found: ${parts?.map((p) => p.name).join(', ') || '(none)'}`
  );
  const participantId = parts?.[0]?.id || '00000000-0000-4000-8000-000000000000';

  // 4. insert with the exact payload addWishlistItem sends
  const { data: inserted, error: e4 } = await client
    .from('wishlist_items')
    .insert({
      participant_id: participantId,
      title: PROBE_TITLE,
      url: 'https://example.com',
      note: 'probe',
      position: 1,
    })
    .select('id, title, url, note, position');
  console.log(
    '[4] insert full payload:',
    e4
      ? `ERROR ${e4.code}: ${e4.message}${e4.details ? ' | details: ' + e4.details : ''}${e4.hint ? ' | hint: ' + e4.hint : ''}`
      : `OK ${JSON.stringify(inserted)}`
  );

  // 5. insert WITHOUT position to isolate the column
  const { error: e5 } = await client
    .from('wishlist_items')
    .insert({
      participant_id: participantId,
      title: PROBE_TITLE + '_2',
      url: '',
      note: '',
    })
    .select('id');
  console.log(
    '[5] insert without position:',
    e5
      ? `ERROR ${e5.code}: ${e5.message}${e5.details ? ' | details: ' + e5.details : ''}${e5.hint ? ' | hint: ' + e5.hint : ''}`
      : 'OK'
  );

  // cleanup
  const { error: e6 } = await client.from('wishlist_items').delete().like('title', PROBE_TITLE + '%');
  console.log('\ncleanup:', e6 ? `ERROR ${e6.code}: ${e6.message}` : 'probe rows deleted');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('unexpected:', err);
    process.exit(1);
  });
