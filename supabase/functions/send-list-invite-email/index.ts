// supabase/functions/send-list-invite-email/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { email, inviterEmail, listNames, appUrl } = await req.json()

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL')

    if (!RESEND_API_KEY || !FROM_EMAIL) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const listText = Array.isArray(listNames)
      ? `<ul>${listNames.map((name: string) => `<li>${name}</li>`).join('')}</ul>`
      : ''

    const html = `
      <h2>Πρόσκληση σε λίστες εργασιών</h2>
      <p>Ο χρήστης <strong>${inviterEmail}</strong> σε προσκάλεσε να συμμετάσχεις στις παρακάτω λίστες:</p>
      ${listText}
      <p>
        <a href="${appUrl}" style="padding:10px 20px;background:#4CAF50;color:white;text-decoration:none;border-radius:5px;">
          Μετάβαση στην εφαρμογή
        </a>
      </p>
      <p>Αν δεν έχεις λογαριασμό, μπορείς να εγγραφείς με αυτό το email.</p>
    `

    console.log('Invite email request:', {
  to: email,
  inviterEmail,
  from: FROM_EMAIL,
  listNames,
})

const resendResponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: FROM_EMAIL,
    to: email,
    subject: 'Πρόσκληση σε λίστες εργασιών',
    html,
  }),
})

const result = await resendResponse.json()

console.log('Resend status:', resendResponse.status)
console.log('Resend response:', result)

if (!resendResponse.ok) {
  return new Response(JSON.stringify(result), {
    status: resendResponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})