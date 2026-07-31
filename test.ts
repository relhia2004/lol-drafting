import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('Testing connection to Supabase...');

  const { data, error } = await supabase
    .from('scrim_blocks')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Connection/query failed:');
    console.error(error);
    process.exit(1);
  }

  console.log('✅ Connected successfully. Sample data:', data);
}

main();