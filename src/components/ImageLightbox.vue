<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { siteUrl } from '../paths'
import type { AnnotationImage } from '../types'

const props = defineProps<{ images: AnnotationImage[]; start: number }>()
const emit = defineEmits<{ close: [] }>()

const index = ref(props.start)

// Reopening on a different thumbnail reuses the component instance.
watch(() => props.start, (i) => (index.value = i))

const current = computed(() => props.images[index.value])

/** Wraps, so the arrows never dead-end on a small gallery. */
const step = (by: number) => {
  const n = props.images.length
  index.value = (index.value + by + n) % n
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowRight') step(1)
  else if (event.key === 'ArrowLeft') step(-1)
  else return
  event.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" @click.self="emit('close')">
      <button class="icon chrome close" type="button" title="Close" @click="emit('close')">
        <span class="sr-only">Close</span>
        <svg viewBox="0 0 14 14" width="16" height="16" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>

      <button
        v-if="images.length > 1"
        class="icon chrome nav prev"
        type="button"
        title="Previous image"
        @click="step(-1)"
      >
        <span class="sr-only">Previous image</span>
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <path d="M10 2L4 8l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>

      <figure @click.self="emit('close')">
        <img :src="siteUrl(current.src)" :alt="current.caption ?? ''" />
        <figcaption v-if="current.caption || images.length > 1">
          <span v-if="current.caption">{{ current.caption }}</span>
          <span v-if="images.length > 1" class="counter">{{ index + 1 }} / {{ images.length }}</span>
        </figcaption>
      </figure>

      <button v-if="images.length > 1" class="icon chrome nav next" type="button" title="Next image" @click="step(1)">
        <span class="sr-only">Next image</span>
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <path d="M6 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px 16px;
  background: rgba(8, 11, 16, 0.86);
  backdrop-filter: blur(3px);
}

figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-height: 100%;
}
img {
  max-width: 100%;
  min-height: 0;
  max-height: calc(100vh - 130px);
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
figcaption {
  display: flex;
  align-items: baseline;
  gap: 10px;
  max-width: 60ch;
  font-size: 12.5px;
  line-height: 1.5;
  text-align: center;
  color: #e9edf4;
}
.counter {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
}

/* The chrome floats over the photo, so it needs its own contrast, not the theme's. */
.chrome {
  color: #e9edf4;
  background: rgba(255, 255, 255, 0.1);
  border-color: transparent;
}
.chrome:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
  border-color: transparent;
}
.close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
}
.nav {
  flex: none;
  width: 38px;
  height: 38px;
}

@media (max-width: 640px) {
  .nav {
    position: absolute;
    bottom: 18px;
  }
  .prev {
    left: 22%;
  }
  .next {
    right: 22%;
  }
}
</style>
