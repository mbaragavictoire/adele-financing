import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // ignore logout errors
    } finally {
      clearToken()
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useAuth() {
  return useContext(AuthContext)
}