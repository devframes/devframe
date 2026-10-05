<script setup lang="ts">
import { locale } from '../../i18n'
import { isDark } from '../../state/color-mode'
</script>

<template>
  <!--
    Carries the `.dark`/`.light` class that class-based UnoCSS utilities resolve
    against. `display: contents` keeps it out of the box tree, so the shell's
    fixed/absolute-positioned children (dock anchor, floating layers) are
    unaffected while every descendant still matches `.dark …` selectors, inside
    the dock's shadow root and the light-DOM standalone page alike. The native
    `color-scheme` inherits down for scrollbars and form controls, as does
    `lang` for hyphenation, fonts and screen readers.
  -->
  <div
    class="devframes-color-root"
    :lang="locale"
    :class="isDark ? 'dark' : 'light'"
    :style="{ display: 'contents', colorScheme: isDark ? 'dark' : 'light' }"
  >
    <slot />
  </div>
</template>
