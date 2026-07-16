/** Devframe id — drives the hosted mount path `/__<id>/`. */
export const PLUGIN_ID = 'devframes_plugin_messages'

/** Preferred standalone CLI port (901x band shared by the core-ish plugins). */
export const DEFAULT_PORT = 9014

/**
 * Server→client notification broadcast by the hub context whenever the
 * message list changes (add/update/remove/clear). Mirrors `@devframes/hub`'s
 * internal event name; kept as a literal so the client bundle carries no hub
 * build dependency.
 */
export const MESSAGES_UPDATED_EVENT = 'devframe:messages:updated'
