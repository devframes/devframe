<script setup lang="ts">
import { useId } from 'vue'

// The devframe logo mark (see `docs/public/logo.svg`) inlined as an SVG so it
// scales to the caller's width/height and ships without a network fetch. The
// gradient id is per-instance unique so multiple marks on one page keep their
// own fill.
const uid = useId()
const gradientId = `devframe-logo-gradient-${uid}`
</script>

<template>
  <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Devframe logo">
    <path
      d="M238.464 40H66V236.007H104.577C220.688 236.007 232.79 158.437 232.79 121.733C232.79 108.867 243.38 108.867 243.38 121.733C251.318 236.701 356.35 245.457 365.527 246.223L365.542 246.224C374.619 246.981 382.561 251.521 365.542 254.548C253.592 264.765 243.758 364.282 243.38 375.634C243.002 386.986 235.438 399.851 232.79 375.634C222.957 274.603 144.289 257.954 104.577 257.954H66V460.772H238.464C358.356 460.772 452.152 371.472 452.152 251.521C452.152 131.571 356.465 40 238.464 40Z"
      :fill="`url(#${gradientId})`"
      stroke="#86997F"
      stroke-opacity="0.5"
      stroke-width="1.33156"
    />
    <defs>
      <radialGradient
        :id="gradientId"
        cx="0"
        cy="0"
        r="1"
        gradientTransform="matrix(399.011 555.102 -568.423 408.982 -11.6221 -34.9218)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#ADC77F" />
        <stop offset="0.71903" stop-color="#517158" />
        <stop offset="1" stop-color="#486954" />
      </radialGradient>
    </defs>
  </svg>
</template>
