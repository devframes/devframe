<script setup lang="ts">
import type { AssetInfo } from '../../../types'
import { onBeforeUnmount, onMounted, watch } from 'vue'

const props = defineProps<{ asset: AssetInfo }>()

// A scoped, unique family so multiple font previews don't clash.
const family = `devframe-assets-${Math.random().toString(36).slice(2)}`
let styleEl: HTMLStyleElement | null = null

function apply(url: string): void {
  if (!styleEl) {
    styleEl = document.createElement('style')
    document.head.append(styleEl)
  }
  styleEl.textContent = `@font-face { font-family: '${family}'; src: url('${url}'); }`
}

onMounted(() => apply(props.asset.publicPath))
watch(() => props.asset.publicPath, url => apply(url))
onBeforeUnmount(() => styleEl?.remove())
</script>

<template>
  <div class="overflow-hidden" :style="{ fontFamily: `'${family}'` }">
    Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz
  </div>
</template>
