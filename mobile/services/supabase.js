import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hhlxgtwvoxpvyvejvxwt.supabase.co'
const supabaseAnonKey = 'sb_publishable_LaG0x6zbfn3HTGFbDE4Lgg_F6bROg8g'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)