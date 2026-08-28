<script setup lang="ts">
const props = defineProps<{
  username: string
}>()

const profileUrl = computed(() => `https://github.com/${props.username}`)
const avatarUrl = computed(() => `${profileUrl.value}.png?size=40`)
const avatarFailed = ref(false)
</script>

<template>
  <a
    :href="profileUrl"
    target="_blank"
    rel="noreferrer"
    :aria-label="`View @${username} on GitHub`"
    class="not-prose inline-flex translate-y-[0.3em] items-center gap-1 rounded-full bg-elevated py-0.5 pr-2 pl-0.5 text-sm text-muted no-underline transition-colors hover:bg-accented hover:text-highlighted"
  >
    <UIcon
      v-if="avatarFailed"
      name="i-simple-icons-github"
      class="size-5 rounded-full bg-default p-0.5"
    />
    <img
      v-else
      :src="avatarUrl"
      alt=""
      width="20"
      height="20"
      loading="lazy"
      class="size-5 rounded-full"
      @error="avatarFailed = true"
    >
    <span><slot /></span>
  </a>
</template>
