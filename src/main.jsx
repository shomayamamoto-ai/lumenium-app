import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadContent } from './lib/content'
import './styles.css'

// Copy overrides from the admin page are applied before the first render, so
// nothing flashes the built-in wording first. loadContent never rejects and
// gives up after a couple of seconds, so a bad content.json cannot stop the
// site from mounting.
loadContent().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
})
