<script setup lang="ts">
/**
 * Shadows the comark-docs layer's OG template to draw the devframe mark,
 * which the layer only ships for its own Comark sites.
 *
 * The mark is inlined: nuxt-og-image renders this through an island that only
 * registers OG templates, so a nested `<LogoMark />` would render nothing.
 */
defineOptions({
  inheritAttrs: false,
})

const { title = '', description = '', headline = '' } = defineProps<{
  title?: string
  description?: string
  headline?: string
}>()

const { seo, docs } = useAppConfig()
const site = useSiteConfig()

const siteName = seo?.siteName || site.name || ''
const host = site.url ? site.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
const accent = docs?.ogImage?.accent || '#fafafa'
</script>

<template>
  <div
    class="flex flex-col flex-1 min-h-full min-w-full"
    style="background: #000; position: relative; overflow: hidden"
  >
    <div
      :style="`
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle, ${withAlpha(accent, 0.03)} 1px, transparent 1px);
        background-size: 28px 28px;
      `"
    />

    <div
      class="flex items-center"
      style="position: absolute; z-index: 1; top: 72px; left: 80px"
    >
      <svg width="44" height="44" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Devframe">
        <path d="M238.464 40H66V236.007H104.577C220.688 236.007 232.79 158.437 232.79 121.733C232.79 108.867 243.38 108.867 243.38 121.733C251.318 236.701 356.35 245.457 365.527 246.223L365.542 246.224C374.619 246.981 382.561 251.521 365.542 254.548C253.592 264.765 243.758 364.282 243.38 375.634C243.002 386.986 235.438 399.851 232.79 375.634C222.957 274.603 144.289 257.954 104.577 257.954H66V460.772H238.464C358.356 460.772 452.152 371.472 452.152 251.521C452.152 131.571 356.465 40 238.464 40Z" fill="url(#og_devframe_fill)" />
        <defs>
          <radialGradient id="og_devframe_fill" cx="0" cy="0" r="1" gradientTransform="matrix(399.011 555.102 -568.423 408.982 -11.6221 -34.9218)" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ADC77F" />
            <stop offset="0.71903" stop-color="#517158" />
            <stop offset="1" stop-color="#486954" />
          </radialGradient>
        </defs>
      </svg>
      <div
        style="
          font-family: 'Geist';
          font-size: 32px;
          font-weight: 600;
          color: #fafafa;
          letter-spacing: -0.02em;
          margin-left: 14px;
        "
      >
        {{ siteName }}
      </div>
    </div>

    <div
      class="flex flex-col flex-1 justify-center min-h-0"
      style="position: relative; z-index: 1; padding: 50px 80px 0"
    >
      <div
        v-if="headline"
        :style="`
          font-family: 'Geist Mono';
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: ${accent};
          margin-bottom: 24px;
        `"
      >
        {{ headline }}
      </div>
      <div
        style="
          font-family: 'Geist';
          font-size: 76px;
          font-weight: 500;
          color: #fafafa;
          line-height: 1;
          letter-spacing: -0.035em;
        "
      >
        {{ title || siteName }}
      </div>

      <div
        v-if="description"
        style="
          font-family: 'Geist';
          font-size: 28px;
          color: #a1a1aa;
          line-height: 1.5;
          margin-top: 24px;
          max-width: 700px;
        "
      >
        {{ truncate(description, 120) }}
      </div>
    </div>

    <div
      v-if="host"
      class="flex shrink-0 items-center min-w-0"
      style="position: absolute; z-index: 1; bottom: 40px; left: 80px"
    >
      <div
        :style="`
          font-family: 'Geist Mono';
          font-size: 16px;
          font-weight: 500;
          line-height: 1;
          letter-spacing: 0.12em;
          color: ${accent};
          white-space: nowrap;
        `"
      >
        {{ host }}
      </div>
    </div>
  </div>
</template>
