<script setup lang="ts">
interface EcosystemSite {
  name: string
  description: string
  /** GitHub login: powers the avatar. */
  author: string
  url: string
  /** 16:9 image under `public/`. */
  screenshot: string
}

defineProps<{
  sites: EcosystemSite[]
  /** Where the "Your project" card sends contributors. */
  addUrl: string
}>()

const cardUi = {
  root: 'overflow-hidden',
  container: 'p-0 sm:p-0 gap-0',
  wrapper: 'items-stretch',
  header: 'mb-0',
  body: 'p-4',
  title: 'text-sm font-medium',
  description: 'mt-1 text-sm leading-relaxed',
  footer: 'mt-auto px-4 pb-4 pt-0',
}
</script>

<template>
  <div class="not-prose mt-14">
    <div
      v-if="$slots.title || $slots.description"
      class="flex items-baseline justify-between gap-4"
    >
      <h2
        v-if="$slots.title"
        class="text-2xl font-semibold tracking-tight text-highlighted"
      >
        <slot name="title" unwrap="p" />
      </h2>
      <span
        v-if="$slots.description"
        class="text-sm text-muted"
      >
        <slot name="description" unwrap="p" />
      </span>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UPageCard
        v-for="site in sites"
        :key="site.name"
        :to="site.url"
        target="_blank"
        :title="site.name"
        :description="site.description"
        :ui="cardUi"
      >
        <template #header>
          <img
            :src="site.screenshot"
            :alt="`${site.name} screenshot`"
            width="960"
            height="540"
            loading="lazy"
            class="aspect-video w-full object-cover object-top"
          >
        </template>

        <template #footer>
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <img
              :src="`https://github.com/${site.author}.png?size=64`"
              :alt="site.author"
              width="16"
              height="16"
              loading="lazy"
              class="size-4 rounded-full"
            >
            {{ site.author }}
          </div>
        </template>
      </UPageCard>

      <UPageCard
        :to="addUrl"
        target="_blank"
        title="Your project"
        description="Shipping something on Devframe? Add a card and it shows up here."
        :ui="{ ...cardUi, root: 'overflow-hidden border-dashed' }"
      >
        <template #header>
          <div class="flex aspect-video w-full items-center justify-center bg-muted">
            <UIcon
              name="i-lucide-plus"
              class="size-8 text-dimmed"
            />
          </div>
        </template>
      </UPageCard>
    </div>
  </div>
</template>
