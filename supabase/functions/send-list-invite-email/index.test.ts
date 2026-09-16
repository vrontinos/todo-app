import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleInviteEmailRequest } from './index.ts'

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'RESEND_API_KEY',
  'INVITE_FROM_EMAIL',
] as const

function setTestEnv() {
  Deno.env.set('SUPABASE_URL', 'https://supabase.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'anon-test-key')
  Deno.env.set('RESEND_API_KEY', 'resend-test-key')
  Deno.env.set('INVITE_FROM_EMAIL', 'Task App <noreply@example.com>')
}

function clearTestEnv() {
  for (const key of ENV_KEYS) Deno.env.delete(key)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return String(input)
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) return await input.clone().text()
  return typeof init?.body === 'string' ? init.body : ''
}

async function withMockFetch(
  mock: typeof fetch,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mock
  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
    clearTestEnv()
  }
}

Deno.test('invite email rejects requests without bearer authentication before any network call', async () => {
  let networkCalled = false

  await withMockFetch(
    (async () => {
      networkCalled = true
      throw new Error('unexpected network call')
    }) as typeof fetch,
    async () => {
      const response = await handleInviteEmailRequest(
        new Request('https://edge.test/send-list-invite-email', {
          method: 'POST',
          body: JSON.stringify({
            invitedEmail: 'friend@example.com',
            listNames: ['Groceries'],
          }),
        }),
      )

      assertEquals(response.status, 401)
      assertFalse(networkCalled)
      assertEquals(await response.json(), { error: 'Unauthorized' })
    },
  )
})

Deno.test('invite email refuses a list not owned by the authenticated caller and never calls Resend', async () => {
  setTestEnv()
  let resendCalled = false

  await withMockFetch(
    (async (input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith('https://supabase.test/auth/v1/user')) {
        return json({
          id: 'user-owner',
          email: 'owner@example.com',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        })
      }

      if (url.startsWith('https://supabase.test/rest/v1/list_invites')) {
        return json([
          {
            id: 'invite-1',
            list_id: 42,
            invited_email: 'friend@example.com',
            invited_by_user_id: 'user-owner',
            status: 'pending',
            created_at: new Date().toISOString(),
            list_name_snapshot: 'Groceries',
          },
        ])
      }

      if (url.startsWith('https://supabase.test/rest/v1/lists')) {
        return json([
          {
            id: 42,
            name: 'Groceries',
            owner_user_id: 'different-user',
          },
        ])
      }

      if (url === 'https://api.resend.com/emails') {
        resendCalled = true
        throw new Error('Resend must not be called for unauthorized lists')
      }

      throw new Error(`unexpected network URL: ${url}`)
    }) as typeof fetch,
    async () => {
      const response = await handleInviteEmailRequest(
        new Request('https://edge.test/send-list-invite-email', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invitedEmail: 'friend@example.com',
            inviterEmail: 'forged@example.com',
            listNames: ['Groceries'],
            appUrl: 'https://todo.example',
          }),
        }),
      )

      assertEquals(response.status, 403)
      assertFalse(resendCalled)
      assertEquals(await response.json(), { error: 'Invite lists are not owned by caller' })
    },
  )
})

Deno.test('authorized invite uses authenticated sender, normalized recipient, escaped list names, and mocked Resend only', async () => {
  setTestEnv()
  let resendCalled = false
  let resendPayload: Record<string, unknown> | null = null

  await withMockFetch(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url.startsWith('https://supabase.test/auth/v1/user')) {
        return json({
          id: 'user-owner',
          email: 'owner@example.com',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        })
      }

      if (url.startsWith('https://supabase.test/rest/v1/list_invites')) {
        return json([
          {
            id: 'invite-1',
            list_id: 42,
            invited_email: 'friend@example.com',
            invited_by_user_id: 'user-owner',
            status: 'pending',
            created_at: new Date().toISOString(),
            list_name_snapshot: 'Groceries',
          },
        ])
      }

      if (url.startsWith('https://supabase.test/rest/v1/lists')) {
        return json([
          {
            id: 42,
            name: '<b>Groceries & more</b>',
            owner_user_id: 'user-owner',
          },
        ])
      }

      if (url === 'https://api.resend.com/emails') {
        resendCalled = true
        resendPayload = JSON.parse(await requestBody(input, init))
        return json({ id: 'mock-resend-message-id' })
      }

      throw new Error(`unexpected network URL: ${url}`)
    }) as typeof fetch,
    async () => {
      const response = await handleInviteEmailRequest(
        new Request('https://edge.test/send-list-invite-email', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-test-token',
            Origin: 'https://todo.example/some/path',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invitedEmail: ' Friend@Example.COM ',
            inviterEmail: 'forged@example.com',
            ownerEmail: 'also-forged@example.com',
            listNames: ['Groceries'],
            appUrl: 'javascript:alert(1)',
          }),
        }),
      )

      assertEquals(response.status, 200)
      assertEquals(await response.json(), { success: true })
      assertEquals(resendCalled, true)
      assertEquals(resendPayload?.to, 'friend@example.com')
      assertEquals(resendPayload?.from, 'Task App <noreply@example.com>')

      const html = String(resendPayload?.html || '')
      assertStringIncludes(html, 'owner@example.com')
      assertFalse(html.includes('forged@example.com'))
      assertStringIncludes(html, '&lt;b&gt;Groceries &amp; more&lt;/b&gt;')
      assertStringIncludes(html, 'href="https://todo.example"')
      assertFalse(html.includes('javascript:'))
    },
  )
})
