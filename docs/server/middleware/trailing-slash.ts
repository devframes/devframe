/**
 * The old VitePress site served directory-style URLs with a trailing slash
 * (`/guide/`, `/errors/`); the comark-docs layer's routes are extensionless
 * without one. Redirect any trailing-slash path to its canonical form so old
 * deep links keep working.
 */
export default defineEventHandler((event) => {
  const path = event.path
  if (path.length > 1 && path.endsWith('/'))
    return sendRedirect(event, path.slice(0, -1), 308)
  const queryIndex = path.indexOf('?')
  if (queryIndex > 1 && path[queryIndex - 1] === '/')
    return sendRedirect(event, path.slice(0, queryIndex - 1) + path.slice(queryIndex), 308)
})
