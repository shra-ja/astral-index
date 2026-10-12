<script setup lang="ts">
// Presentational: the open lockup, for large sizes such as the About dialog: the
// regular emblem without its tile beside the regular wordmark, both sized from the
// wordmark's height H, `--h` (40 px unless the caller sets it). The emblem's paths are
// those of `assets/brand/astral-index-emblem.svg`, kept as supplied, drawn inline so it
// takes `currentColor`, with the viewBox cropped to the artwork as the brand specifies;
// a test keeps them identical.
import wordmark from '../../assets/brand/astral-index-wordmark.svg'
</script>

<template>
  <div class="open-lockup" role="img" aria-label="Astral Index">
    <svg viewBox="41.82 70.88 187.28 124.47" aria-hidden="true">
      <g fill="currentColor" transform="translate(20.48 20.48) scale(.84)">
        <path
          d="M138.82 84.68 C138.22 83.30 137.63 81.86 137.02 80.35 C144.33 76.49 152.58 72.77 161.48 69.13 C177.33 77.78 186.82 88.12 177.80 102.93 C177.21 102.98 176.62 103.02 176.02 103.07 C175.68 89.59 167.93 81.81 157.36 76.37 C151.06 78.84 144.87 81.56 138.82 84.68 Z"
        />
        <path
          d="M72.74 151.82 C45.69 153.07 32.83 143.19 25.40 129.64 C52.97 116.43 78.00 107.48 101.53 107.65 C101.03 108.05 100.52 108.44 100.00 108.83 C75.11 113.48 55.99 120.75 38.77 129.42 C43.18 138.26 52.51 146.03 73.64 150.68 C73.33 151.06 73.03 151.44 72.74 151.82 Z"
        />
        <path
          d="M128.00 63.00 C142.00 114.00 142.00 114.00 193.00 128.00 C153.62 138.81 144.65 141.27 136.16 165.32 C131.60 168.64 127.14 171.64 122.76 174.38 C113.00 141.72 106.85 140.04 63.00 128.00 C114.00 114.00 114.00 114.00 128.00 63.00 Z"
        />
        <path
          d="M176.00 105.62 C207.37 102.25 228.62 111.03 248.36 126.08 C217.23 143.10 185.71 154.63 153.72 151.57 C187.41 146.64 211.17 137.33 230.37 126.37 C218.99 116.38 203.19 108.82 176.00 105.62 Z"
        />
        <path
          d="M153.72 151.57 C148.11 173.18 120.44 191.06 82.40 208.18 C65.87 189.45 60.16 171.75 77.62 151.49 C72.28 170.92 78.21 184.27 89.71 195.32 C113.75 185.17 135.83 171.91 153.72 151.57 Z"
        />
        <path
          d="M78 60 C81.5 72.5 81.5 72.5 94 76 C81.5 79.5 81.5 79.5 78 92 C74.5 79.5 74.5 79.5 62 76 C74.5 72.5 74.5 72.5 78 60 Z"
          transform="translate(0 -8)"
        />
        <path
          d="M198 166 C201.5 178.5 201.5 178.5 214 182 C201.5 185.5 201.5 185.5 198 198 C194.5 185.5 194.5 185.5 182 182 C194.5 178.5 194.5 178.5 198 166 Z"
          transform="translate(-8 8)"
        />
      </g>
    </svg>
    <img :src="wordmark" alt="" />
  </div>
</template>

<style scoped>
.open-lockup {
  display: flex;
  align-items: center;
  gap: calc(var(--h, 40px) * 0.4);
}
svg {
  flex: none;
  width: auto;
  height: calc(var(--h, 40px) * 1.284);
  color: #faf9f5;
}
img {
  display: block;
  width: auto;
  height: var(--h, 40px);
}
</style>
