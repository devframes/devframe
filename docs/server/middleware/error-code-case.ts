/**
 * Error reference pages live at `/errors/DFxxxx` (uppercase, derived from the
 * content filenames). Accept any-case deep links like `/errors/df8111` and
 * redirect them to the canonical uppercase URL so a single URL is indexed.
 */
export default defineEventHandler((event) => {
  const match = /^\/errors\/(df\d{4})(?=\/|$|\?)/i.exec(event.path)
  if (!match)
    return
  const canonical = match[1].toUpperCase()
  if (match[1] === canonical)
    return // already canonical, let it through
  return sendRedirect(event, event.path.replace(match[1], canonical), 308)
})
