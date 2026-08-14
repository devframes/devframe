import type { InjectionKey } from 'vue'

/**
 * Injection key for the current dock's own identity — the `viewId`
 * {@link JsonRenderView} is mounted with (a shared-state `stateKey`, or a
 * client-synthesized dock id). `JsonRenderView` `provide()`s it once per
 * mounted view; {@link useUncontrolledValue}'s session-persistence key
 * `inject()`s it instead of threading the id through every registry
 * component's props.
 */
export const DOCK_ENTRY_ID_KEY: InjectionKey<string | undefined> = Symbol('devframes:json-render:dock-entry-id')
