<script setup lang="ts">
const props = defineProps<{
  /** Variant label shown under the preview. */
  name: string
  /** Preview / PNG background color. */
  bg: string
  /** Raw SVG source of the asset. */
  svg: string
  /** Download base name (without extension). */
  file: string
  /** Intrinsic size used for the PNG render. */
  size: { w: number, h: number }
}>()

const copied = ref(false)

function withXmlns(svg: string): string {
  return svg.includes('xmlns=')
    ? svg
    : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
}

async function copySvg(): Promise<void> {
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
  await navigator.clipboard.writeText(withXmlns(props.svg))
}

function downloadSvg(): void {
  triggerDownload(
    URL.createObjectURL(new Blob([withXmlns(props.svg)], { type: 'image/svg+xml;charset=utf-8' })),
    `${props.file}.svg`,
  )
}

async function downloadPng(): Promise<void> {
  const PAD = 32
  const SCALE = 2
  const { w, h } = props.size

  const canvas = document.createElement('canvas')
  canvas.width = (w + PAD * 2) * SCALE
  canvas.height = (h + PAD * 2) * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = props.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const img = new Image()
  // Data URLs are more reliable than blob URLs for SVG → canvas in Chromium.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withXmlns(props.svg))}`
  await img.decode()
  ctx.drawImage(img, PAD * SCALE, PAD * SCALE, w * SCALE, h * SCALE)

  const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!pngBlob)
    return
  triggerDownload(URL.createObjectURL(pngBlob), `${props.file}.png`)
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="rounded-xl border border-default overflow-hidden">
    <div
      class="flex items-center justify-center py-14 px-10"
      :style="{ backgroundColor: bg }"
    >
      <img
        src="/logo.svg"
        alt=""
        class="h-16 w-auto"
      >
    </div>

    <div class="flex items-center justify-between px-4 py-3 bg-muted">
      <span class="text-sm text-muted font-medium">{{ name }}</span>
      <div class="flex items-center gap-1.5">
        <UTooltip text="Copy SVG">
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-clipboard'"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            class="cursor-pointer"
            @click="copySvg"
          />
        </UTooltip>
        <UButton
          label="SVG"
          color="neutral"
          variant="outline"
          size="xs"
          class="cursor-pointer"
          @click="downloadSvg"
        />
        <UButton
          label="PNG"
          color="neutral"
          variant="outline"
          size="xs"
          class="cursor-pointer"
          @click="downloadPng"
        />
      </div>
    </div>
  </div>
</template>
