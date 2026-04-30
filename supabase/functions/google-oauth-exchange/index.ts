import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // Expected to be user_id (or base64 encoded user_id)
  
  const APP_URL = Deno.env.get('APP_URL') || ''
  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!code || !state) {
    return Response.redirect(`${APP_URL}/?google_error=missing_params`, 302)
  }

  try {
    // 2. Decode state to get user_id
    // Assuming state is just the user_id or a simple base64 encoded string containing it
    let userId: string
    try {
      userId = atob(state)
    } catch {
      userId = state // Fallback if it's not base64
    }

    // 3. Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('Google Token Error:', tokenData.error_description || tokenData.error)
      return Response.redirect(`${APP_URL}/?google_error=${encodeURIComponent(tokenData.error)}`, 302)
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString()

    // 6. Upsert into google_oauth_tokens
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { error: upsertError } = await supabase
      .from('google_oauth_tokens')
      .upsert({
        user_id: userId,
        access_token,
        refresh_token: refresh_token || '', // refresh_token might not be sent every time
        expires_at,
        scope,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('Database Error:', upsertError)
      return Response.redirect(`${APP_URL}/?google_error=database_error`, 302)
    }

    return Response.redirect(`${APP_URL}/?google_connected=1`, 302)

  } catch (error) {
    console.error('Unexpected Error:', error)
    return Response.redirect(`${APP_URL}/?google_error=unexpected_error`, 302)
  }
})
