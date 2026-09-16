function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[auth-storage-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[auth-storage-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function authStorageSafetyPatch() {
  return {
    name: 'auth-storage-safety-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      // Keep exact-match guards identical on Windows and Linux checkouts.
      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        "const [authPassword, setAuthPassword] = useState(() => localStorage.getItem('savedLoginPassword') || '')",
        "const [authPassword, setAuthPassword] = useState('')",
        'password state must never hydrate from localStorage'
      )

      next = replaceExactlyOnce(
        next,
        `useEffect(() => {
  if (session || autoLoginTried) return
  if (authMode !== 'signin') return

  const remembered = localStorage.getItem('rememberLogin') === 'true'
  const email = localStorage.getItem('savedLoginEmail')
  const password = localStorage.getItem('savedLoginPassword')

  if (!remembered || !email || !password) {
    setAutoLoginTried(true)
    setAuthLoading(false)
    return
  }

  setAutoLoginTried(true)
  setAuthLoading(true)

  supabase.auth
    .signInWithPassword({ email, password })
    .catch((error) => {
      console.error('Auto login failed:', error)
      setAuthError('Η αυτόματη σύνδεση απέτυχε. Συνδέσου ξανά.')
    })
    .finally(() => {
      setAuthLoading(false)
    })
}, [session, autoLoginTried, authMode])`,
        `useEffect(() => {
  // Remove credentials left by older versions. Supabase persists the session
  // itself; plaintext passwords must never be used for automatic sign-in.
  localStorage.removeItem('savedLoginPassword')

  if (session || autoLoginTried) return
  if (authMode !== 'signin') return

  setAutoLoginTried(true)
}, [session, autoLoginTried, authMode])`,
        'legacy plaintext password auto-login'
      )

      next = replaceExactlyOnce(
        next,
        "  localStorage.setItem('savedLoginPassword', password)",
        "  localStorage.removeItem('savedLoginPassword')",
        'password storage after sign-in'
      )

      next = replaceExactlyOnce(
        next,
        "    setAuthPassword(localStorage.getItem('savedLoginPassword') || '')",
        "    setAuthPassword('')",
        'password restore after sign-out'
      )

      return { code: next, map: null }
    },
  }
}
