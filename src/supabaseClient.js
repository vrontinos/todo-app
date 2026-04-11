import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://yjiqoorywjyrjgrcpvyb.supabase.co'

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dgtR23x4KR0vvwruGQ4FqA_DGxYqzUn'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)