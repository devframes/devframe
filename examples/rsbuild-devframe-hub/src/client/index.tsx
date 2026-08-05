import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Page } from './Page'
import './uno.css'
import '@antfu/design/styles.css'

const container = document.getElementById('root')!
createRoot(container).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
