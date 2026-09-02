/**
 * Shared between `devframes.ts` (the group's iframe members) and `seed.ts`
 * (the group entry itself and its action member) - a group entry and its
 * members are separate `docks.register()` calls that only line up through
 * this matching `groupId`.
 */
export const PLAYGROUND_GROUP_ID = 'playground-tools'
