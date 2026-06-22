/* @refresh reload */
import { render } from 'solid-js/web'
import { App } from './app.tsx'
import './styles.css'

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')

render(() => <App />, root)
