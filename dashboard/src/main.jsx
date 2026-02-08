import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { TrialStatusProvider } from './trialStatus.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TrialStatusProvider>
      <App />
    </TrialStatusProvider>
  </StrictMode>,
)
