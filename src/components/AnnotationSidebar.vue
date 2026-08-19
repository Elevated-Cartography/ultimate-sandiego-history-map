<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ImageLightbox from './ImageLightbox.vue'
import { clearSelection, selected, selectedFeature } from '../annotations'
import { layerAt } from '../store'
import { renderMarkdown } from '../markdown'
import { siteUrl } from '../paths'

const lightboxAt = ref<number | null>(null)

const feature = computed(() => selectedFeature.value)
const images = computed(() => feature.value?.properties.images ?? [])
const body = computed(() => renderMarkdown(feature.value?.properties.body ?? ''))

/** Which historical map this area was drawn on — worth naming, since several can be shown at once. */
const sourceMap = computed(() => (selected.value ? layerAt(selected.value.mapId)?.map : undefined))

// A different polygon means the old gallery position is meaningless.
watch(feature, () => (lightboxAt.value = null))

const onKey = (event: KeyboardEvent) => {
  // The lightbox sits on top and owns Escape while it is open.
  if (event.key === 'Escape' && lightboxAt.value === null) clearSelection()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <aside v-if="feature" class="annotation" aria-label="Area details">
    <header>
      <div class="titles">
        <h2>{{ feature.properties.title || 'Untitled area' }}</h2>
        <p v-if="sourceMap" class="sub">{{ sourceMap.title }} · {{ sourceMap.year }}</p>
      </div>
      <button class="icon" type="button" title="Close" @click="clearSelection()">
        <span class="sr-only">Close</span>
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div class="body">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised in renderMarkdown() -->
      <div v-if="feature.properties.body" class="prose" v-html="body" />
      <p v-else class="empty">No description yet.</p>

      <div v-if="images.length" class="gallery">
        <button
          v-for="(image, i) in images"
          :key="image.src"
          class="thumb"
          type="button"
          :title="image.caption || 'View image'"
          @click="lightboxAt = i"
        >
          <img :src="siteUrl(image.src)" :alt="image.caption ?? ''" loading="lazy" />
        </button>
      </div>
    </div>

    <ImageLightbox
      v-if="lightboxAt !== null"
      :images="images"
      :start="lightboxAt"
      @close="lightboxAt = null"
    />
  </aside>
</template>

<style scoped>
.annotation {
  position: absolute;
  z-index: 6;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow);
}

header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--line);
}
.titles {
  flex: 1;
  min-width: 0;
}
h2 {
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
}
.sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-dim);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}
.empty {
  font-size: 12.5px;
  color: var(--text-dim);
}

.gallery {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.thumb {
  padding: 0;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
}
.thumb:hover {
  border-color: var(--accent);
}
.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 820px) {
  .annotation {
    width: 100%;
    top: auto;
    max-height: 62%;
    border-left: 0;
    border-top: 1px solid var(--line);
  }
}
</style>
