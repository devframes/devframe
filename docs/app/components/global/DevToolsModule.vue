<script setup lang="ts">
type Theme = 'blue' | 'default' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'

const props = withDefaults(defineProps<{
  activeFramework?: string
  frameworks?: string
  icon?: string
  image?: string
  logo?: string
  logoImage?: string
  name: string
  theme?: Theme
}>(), {
  activeFramework: undefined,
  frameworks: undefined,
  icon: undefined,
  image: undefined,
  logo: undefined,
  logoImage: undefined,
  theme: 'default',
})

const themes: Record<Theme, string> = {
  default: 'border-gray-500/25 bg-gray-500/10 text-gray-600 shadow-gray-500/20 dark:text-gray-300',
  green: 'border-green-500/25 bg-green-500/10 text-green-700 shadow-green-500/20 dark:text-green-300',
  teal: 'border-teal-500/25 bg-teal-500/10 text-teal-700 shadow-teal-500/20 dark:text-teal-300',
  blue: 'border-blue-500/25 bg-blue-500/10 text-blue-700 shadow-blue-500/20 dark:text-blue-300',
  red: 'border-red-500/25 bg-red-500/10 text-red-700 shadow-red-500/20 dark:text-red-300',
  pink: 'border-pink-500/25 bg-pink-500/10 text-pink-700 shadow-pink-500/20 dark:text-pink-300',
  yellow: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 shadow-yellow-500/20 dark:text-yellow-300',
  purple: 'border-purple-500/25 bg-purple-500/10 text-purple-700 shadow-purple-500/20 dark:text-purple-300',
  orange: 'border-orange-500/25 bg-orange-500/10 text-orange-700 shadow-orange-500/20 dark:text-orange-300',
}

const supportedFrameworks = computed(() => props.frameworks?.split(' ') ?? [])
const highlighted = computed(() => !!props.activeFramework
  && (props.activeFramework === 'your'
    || !props.frameworks
    || supportedFrameworks.value.includes(props.activeFramework)))
const dimmed = computed(() => !!props.activeFramework && !highlighted.value)
</script>

<template>
  <div
    :title="name"
    tabindex="0"
    class="relative box-border flex h-20 w-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border p-2 outline-none transition-all duration-300 ease-out hover:z-10 hover:-translate-y-0.5 hover:shadow-lg focus-visible:z-10 focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:shadow-lg max-md:h-10 max-md:w-28 max-md:flex-row"
    :class="[
      themes[theme],
      dimmed && 'opacity-20',
      highlighted && '-translate-y-0.5 shadow-lg',
    ]"
  >
    <img
      v-if="image"
      :src="image"
      alt=""
      class="size-7 flex-none object-contain"
    >
    <UIcon
      v-else
      :name="icon!"
      class="size-7 flex-none"
    />

    <span class="w-full overflow-hidden text-center text-[0.65rem] leading-tight font-medium text-ellipsis max-md:flex-1">
      {{ name }}
    </span>

    <img
      v-if="logoImage"
      :src="logoImage"
      alt=""
      class="pointer-events-none absolute top-1.5 right-1.5 size-3.5 object-contain max-md:hidden"
    >
    <UIcon
      v-else-if="logo"
      :name="logo"
      class="pointer-events-none absolute top-1.5 right-1.5 size-3.5 max-md:hidden"
    />
  </div>
</template>
