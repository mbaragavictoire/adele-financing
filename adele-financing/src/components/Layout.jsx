import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import { observeReveal, revealAboveTheFold, cancelRevealFailsafe } from '../reveal.js'

function Layout() {
  const location = useLocation()
  const mainRef = useRef(null)

  // Scroll to the top on navigation, matching the new page's fade-in.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  // Reveal cards and sections as they come into view. Runs per route so newly
  // rendered content is prepared, and is a no-op for unchanged markup.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    observeReveal(main)
    const frame = requestAnimationFrame(() => revealAboveTheFold(main))
    return () => {
      cancelAnimationFrame(frame)
      cancelRevealFailsafe()
    }
  }, [location.pathname])

  return (
    <div className="app">
      <Navbar />
      {/* keyed on the path so each route plays its own short fade-in */}
      <main className="main page-enter" key={location.pathname} ref={mainRef}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default Layout