import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'

async function bootTauri() {
  if (!window.__TAURI__) return

  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()

    const badge = document.createElement('div')
    badge.textContent = `v${version}`

    badge.style.position = 'fixed'
    badge.style.right = '12px'
    badge.style.bottom = '12px'
    badge.style.zIndex = '9999'
    badge.style.padding = '6px 10px'
    badge.style.borderRadius = '8px'
    badge.style.background = 'rgba(0, 0, 0, 0.6)'
    badge.style.color = '#fff'
    badge.style.fontSize = '12px'
    badge.style.fontFamily = 'Arial, sans-serif'
    badge.style.pointerEvents = 'none'
    badge.style.backdropFilter = 'blur(4px)'

    document.body.appendChild(badge)
  } catch (e) {
    console.error('Version error:', e)
  }
}

bootTauri()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)