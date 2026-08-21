<script setup lang="ts">
// Shadows the comark-docs layer's brand-assets page with devframe's assets.
import { joinURL } from 'ufo'
import logoSvg from '../../public/logo.svg?raw'

definePageMeta({
  layout: 'docs',
})

const title = 'Brand assets'
const description = 'Logos and assets for Devframe. Download SVG or PNG, or copy the raw SVG source directly.'

const site = useSiteConfig()
const canonicalUrl = computed(() => joinURL(site.url, '/logos'))

useRobotsRule('index, follow')

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

defineOgImage('DocsSatori', {
  title,
  description,
})
</script>

<template>
  <div>
    <UPageHeader
      :title="title"
      :description="description"
    />

    <UPageBody>
      <section>
        <h2 class="text-2xl text-highlighted font-bold">
          Devframe
        </h2>
        <p class="mt-2 mb-6">
          Build a devtool once. Mount it anywhere.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BrandAssetCard
            name="Light"
            bg="#ffffff"
            :svg="logoSvg"
            file="devframe-logo"
            :size="{ w: 500, h: 500 }"
          />
          <BrandAssetCard
            name="Dark"
            bg="#0a0a0a"
            :svg="logoSvg"
            file="devframe-logo"
            :size="{ w: 500, h: 500 }"
          />
        </div>
      </section>
    </UPageBody>
  </div>
</template>
