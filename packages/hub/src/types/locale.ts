/**
 * Translations of a `title`, keyed by BCP 47 tag (`'zh-CN'`, `'ja'`). The
 * plain `title` stays the default and is what a reader shows when no tag
 * matches, so a registrant adds languages without breaking a reader that
 * ignores this field. Resolve with `resolveTitle()` from `@devframes/hub`.
 */
export type DevframeTitleLocales = Record<string, string>

/** Anything carrying a `title` with optional translations: a dock entry, a command, a launcher. */
export interface DevframeTitled {
  title: string
  titleLocales?: DevframeTitleLocales
}
