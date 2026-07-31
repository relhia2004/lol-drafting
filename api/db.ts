// api/db.ts
import { createClient } from '@supabase/supabase-js';

// Reads standard Supabase HTTP URL and Anon Key
const supabaseUrl = process.env.SUPABASE_URL || 'https://ufedhnjvpklnunzckqma.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_T1-18efK-gCIgEVj5_u1mw_akNGdvLt';

export const supabase = createClient(supabaseUrl, supabaseKey);