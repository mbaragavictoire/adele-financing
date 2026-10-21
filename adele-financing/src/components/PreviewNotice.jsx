import { Link } from 'react-router-dom'

export function PreviewNotice() {
  return <aside role="status" style={{ padding: '12px', background: '#fff3cd', color: '#332700' }}>
    Synthetic preview only. Login, applications, messages and financial operations are disabled.
  </aside>
}

export function PreviewUnavailable() {
  return <main style={{ padding: '3rem', maxWidth: '900px', margin: 'auto' }}>
    <h1>Unavailable in this preview</h1>
    <p>This preview contains no customer accounts or operational financial services.</p>
    <Link to="/">Return to the preview home page</Link>
  </main>
}
