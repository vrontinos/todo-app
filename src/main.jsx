import React from 'react'
import ReactDOM from 'react-dom/client'
import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import App from './App.jsx'
import './App.css'

async function showDesktopVersion() {
  const isMobile = window.innerWidth <= 1024

if (!isTauri() || isMobile) return

  try {
    const version = await getVersion()

    const badge = document.createElement('div')
    badge.textContent = `v${version}`

    badge.style.position = 'fixed'
    badge.style.right = '4px'
badge.style.bottom = '2px'
badge.style.fontSize = '9px'
badge.style.padding = '1px 4px'
badge.style.opacity = '0.5'
badge.style.background = 'transparent'
badge.style.color = '#888'
    badge.style.fontSize = '11px'
    badge.style.lineHeight = '1'
    badge.style.pointerEvents = 'none'
    badge.style.opacity = '0.75'

    document.body.appendChild(badge)
  } catch (error) {
    console.error('Version error:', error)
  }
}

showDesktopVersion()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)