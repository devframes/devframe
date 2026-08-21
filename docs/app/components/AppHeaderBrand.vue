<script setup lang="ts">
// Shadows the comark-docs layer's AppHeaderBrand: drops the Vercel OSS mark
// and shows the devframe logo with its wordmark instead.
const { header } = useAppConfig()
const cms = useDocsContent()
</script>

<template>
  <div class="flex shrink-0 items-center gap-2.5">
    <NuxtLink
      :to="prefixLink(header?.to || '/', cms.base)"
      :aria-label="header?.logo?.alt || header?.title"
      class="flex items-center gap-2 text-highlighted! lg:mr-3"
    >
      <AppHeaderLogo class="shrink-0" />
      <span class="text-lg font-semibold text-highlighted">{{ header?.title }}</span>
    </NuxtLink>
  </div>
</template>
