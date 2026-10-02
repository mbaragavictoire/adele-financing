import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, purgeLegacyToken, setSessionExpiredHandler } from './api.js'

const AuthContext = createContext(null)

/**
 * The signed-in user is never read from browser storage. On load the app asks
 * the backend "is there a valid session?" and believes the answer. That means
 * the server alone decides who is signed in: editing localStorage, a React
 * devtools state override, or any other client-side trick cannot produce an
 * authenticated session, and the API would refuse it regardless.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)

  function endSession(message) {
    setUser(null)
    setSession(null)
    setSessionEnded(message)
  }

  // Subscribe to 401s raised anywhere in the app by the API helper, so an
  // expired or revoked session cannot leave the UI looking signed in.
  useEffect(() => {
    setSessionExpiredHandler((message) => {
      setUser((current) => (current ? endSession(message) : current))
    })
    // Any JWT from the previous scheme is discarded on boot.
    purgeLegacyToken()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await api('/auth/me')
        if (cancelled) return
        setUser(data.user)
        setSession(data.session || null)
      } catch {
        // A 401 here simply means nobody is signed in, which is the normal
        // state on first visit to the login screen.
        if (!cancelled) {
          setUser(null)
          setSession(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    setSessionEnded(false)
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      // The server has set the HttpOnly cookie. There is nothing to store here,
      // so the user object is all the client keeps.
      setUser(data.user)
      setSession(null)
      return data.user
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // The server closes the session row and clears the cookie, so the session
      // is unusable even if the cookie was captured beforehand.
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // ignore logout errors; the local state is cleared regardless
    } finally {
      setUser(null)
      setSession(null)
      setSessionEnded(false)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, setUser, loading, error, login, logout, sessionEnded }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useAuth() {
  return useContext(AuthContext)
}