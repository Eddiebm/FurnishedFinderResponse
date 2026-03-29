export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: 40, background: '#0a0a0b', color: '#f0f0f2', minHeight: '100vh' }}>
      <h1 style={{ color: '#e8ff5a', marginBottom: 8 }}>LeaseAI Backend</h1>
      <p style={{ color: '#4a4a5a', marginBottom: 32 }}>Furnished Finder Automation API</p>
      <h2 style={{ fontSize: 14, color: '#8a8a9a', marginBottom: 16 }}>ENDPOINTS</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 700 }}>
        {[
          ['GET', '/api/status', 'System status + lead counts'],
          ['GET', '/api/leads', 'All leads'],
          ['POST', '/api/leads', 'Create lead manually'],
          ['PATCH', '/api/leads/:id', 'Update lead (status, flags, etc)'],
          ['DELETE', '/api/leads/:id', 'Delete lead'],
          ['GET', '/api/respond?leadId=xxx', 'Generate AI draft (no send)'],
          ['POST', '/api/respond', 'Generate + send AI response'],
          ['GET', '/api/properties', 'All properties'],
          ['POST', '/api/properties', 'Add property'],
          ['GET /POST', '/api/properties/settings', 'AI settings'],
          ['GET', '/api/gmail/poll?secret=xxx', 'Trigger manual poll'],
          ['GET', '/api/auth/gmail?secret=xxx', 'Start Gmail OAuth'],
        ].map(([method, path, desc]) => (
          <tr key={path} style={{ borderBottom: '1px solid #2a2a32' }}>
            <td style={{ padding: '10px 16px 10px 0', color: '#e8ff5a', fontSize: 12, whiteSpace: 'nowrap' }}>{method}</td>
            <td style={{ padding: '10px 24px 10px 0', fontSize: 12, color: '#4d9fff' }}>{path}</td>
            <td style={{ padding: '10px 0', fontSize: 12, color: '#8a8a9a' }}>{desc}</td>
          </tr>
        ))}
      </table>
    </main>
  )
}
