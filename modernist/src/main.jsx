import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { FeaturesProvider } from './context/FeaturesContext'
import './theme.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <FeaturesProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FeaturesProvider>
    </AuthProvider>
  </StrictMode>,
)
