import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken, setSessionExpiredHandler } from './api.js'

const AuthContext = createContext(null)

// Keeps the signed-in user visible in sync with the server's decision on any
// request. Without this, an expired or revoked token leaves the UI showing a
// logged-in user while every call fails with 401.
function onSessionExpired(handler) {
  setSessionExpiredHandler(handler)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)

  function endSession(message) {
    clearToken()
    setUser(null)
    setSessionEnded(message)
  }

  // Subscribe to 401s raised anywhere in the app by the API helper.
  useEffect(() => {
    onSessionExpired((message) => {
      setUser((current) => (current ? endSession(message) : current))
    })
  }, [])

  useEffect(() => {
    async function load() {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const data = await api('/auth/me')
        setUser(data.user)
      } catch {
        clearToken()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function login(email, password) {
    setError(null)
    setSessionEnded(false)
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      setToken(data.token)
      setUser(data.user)
      return data.user
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function logout() {
    try {
      // The server revokes this token's jti, so a copied JWT stops working
      // immediately instead of remaining valid until it expires.
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // ignore logout errors
    } finally {
      clearToken()
      setUser(null)
      setSessionEnded(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, error, login, logout, sessionEnded }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useAuth() {
  return useContext(AuthContext)
}