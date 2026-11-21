import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'
import './styles/layout.css'
import App from './App.jsx'
import { apiService } from './services/apiService.js'

// Wave 3 / Step 3.1 — the clinic's clock is the site's only clock. Sync it
// from the server on boot, then keep it synced: a wrong laptop clock or a
// foreign timezone must not be able to shift the schedule.
const CLINIC_CLOCK_SYNC_MS = 5 * 60 * 1000;

const bootClinicClock = async () => {
  await apiService.syncClinicClock()
}

bootClinicClock()
setInterval(bootClinicClock, CLINIC_CLOCK_SYNC_MS)

// Wave 4 / Step 4.1 — the 30-day session: renew silently on boot so a
// returning staff member's first data call carries a live access token.
apiService.refreshSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
