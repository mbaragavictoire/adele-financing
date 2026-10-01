import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Marks that scripting is available. The scroll-reveal styles in index.css are
// scoped to `.js`, so if this module never runs the page renders plainly
// instead of leaving content hidden. Set here rather than in index.html because
// the Content-Security-Policy allows `script-src 'self'` only, which blocks
// inline scripts.
document.documentElement.classList.add('js')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
