// supabase/functions/send-list-invite-email/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.102.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getSnapshotListName(value: unknown) {
  const snapshot = String(value ?? '').trim()
  if (!snapshot.startsWith('[[BATCH:')) return snapshot

  const markerIndex = snapshot.indexOf(']]')
  if (markerIndex === -1) return snapshot

  return snapshot.slice(markerIndex + 2).trim()
}

function getRequestedListNames(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((name) => String(name ?? '').trim())
        .filter(Boolean)
    )
  ).slice(0, 25)
}

function getSafeAppUrl(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.origin
  } catch {
    return null
  }
}

export async function handleInviteEmailRequest(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Invite email auth environment is incomplete')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const token = authHeader.slice('Bearer '.length).trim()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user?.id || !user.email) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const payload = await req.json()
    const invitedEmail = normalizeEmail(payload?.invitedEmail ?? payload?.email)
    const requestedListNames = getRequestedListNames(payload?.listNames)

    if (!invitedEmail || !invitedEmail.includes('@')) {
      return jsonResponse({ error: 'Invalid invited email' }, 400)
    }

    if (requestedListNames.length === 0) {
      return jsonResponse({ error: 'No lists supplied' }, 400)
    }

    const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: inviteRows, error: inviteError } = await supabase
      .from('list_invites')
      .select('id, list_id, invited_email, invited_by_user_id, status, created_at, list_name_snapshot')
      .eq('invited_by_user_id', user.id)
      .eq('invited_email', invitedEmail)
      .eq('status', 'pending')
      .gte('created_at', recentCutoff)
      .limit(100)

    if (inviteError) {
      console.error('Invite authorization query failed:', inviteError.message)
      return jsonResponse({ error: 'Could not authorize invite email' }, 500)
    }

    const requestedNameSet = new Set(requestedListNames)
    const matchingInvites = (inviteRows || []).filter((invite) =>
      requestedNameSet.has(getSnapshotListName(invite.list_name_snapshot))
    )
    const matchedNameSet = new Set(
      matchingInvites.map((invite) => getSnapshotListName(invite.list_name_snapshot))
    )

    if (
      matchingInvites.length === 0 ||
      requestedListNames.some((name) => !matchedNameSet.has(name))
    ) {
      return jsonResponse({ error: 'Invite email is not authorized' }, 403)
    }

    const listIds = Array.from(new Set(matchingInvites.map((invite) => invite.list_id)))
    const { data: listRows, error: listError } = await supabase
      .from('lists')
      .select('id, name, owner_user_id')
      .in('id', listIds)

    if (listError) {
      console.error('Invite list authorization query failed:', listError.message)
      return jsonResponse({ error: 'Could not authorize invite lists' }, 500)
    }

    const listsById = new Map((listRows || []).map((list) => [String(list.id), list]))
    const everyListOwnedByCaller = listIds.every((listId) => {
      const list = listsById.get(String(listId))
      return list && String(list.owner_user_id) === String(user.id)
    })

    if (!everyListOwnedByCaller) {
      return jsonResponse({ error: 'Invite lists are not owned by caller' }, 403)
    }

    const authorizedListNames = matchingInvites.map((invite) => {
      const list = listsById.get(String(invite.list_id))
      return String(list?.name || getSnapshotListName(invite.list_name_snapshot)).trim()
    })

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL')

    if (!RESEND_API_KEY || !FROM_EMAIL) {
      console.error('Invite email delivery environment is incomplete')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    const requestOrigin = getSafeAppUrl(req.headers.get('Origin'))
    const payloadAppUrl = getSafeAppUrl(payload?.appUrl)
    const appUrl = requestOrigin || payloadAppUrl

    const listText = `<ul>${authorizedListNames
      .map((name) => `<li>${escapeHtml(name)}</li>`)
      .join('')}</ul>`

    const appLink = appUrl
      ? `
      <p>
        <a href="${escapeHtml(appUrl)}" style="padding:10px 20px;background:#4CAF50;color:white;text-decoration:none;border-radius:5px;">
          Μετάβαση στην εφαρμογή
        </a>
      </p>`
      : ''

    const html = `
      <h2>Πρόσκληση σε λίστες εργασιών</h2>
      <p>Ο χρήστης <strong>${escapeHtml(user.email)}</strong> σε προσκάλεσε να συμμετάσχεις στις παρακάτω λίστες:</p>
      ${listText}
      ${appLink}
      <p>Αν δεν έχεις λογαριασμό, μπορείς να εγγραφείς με αυτό το email.</p>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: invitedEmail,
        subject: 'Πρόσκληση σε λίστες εργασιών',
        html,
      }),
    })

    if (!resendResponse.ok) {
      console.error('Resend invite email failed with status:', resendResponse.status)
      return jsonResponse({ error: 'Invite email delivery failed' }, 502)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Invite email function failed:', (error as Error).message)
    return jsonResponse({ error: 'Invite email request failed' }, 500)
  }
}

if (import.meta.main) {
  serve(handleInviteEmailRequest)
}
