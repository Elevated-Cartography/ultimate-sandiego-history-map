<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { aboutOpen, layers } from '../store'

const REPO = 'https://github.com/Elevated-Cartography/ultimate-sandiego-history-map'
const NEW_ISSUE = `${REPO}/issues/new`

const close = () => (aboutOpen.value = false)

/** Described from the manifest rather than hardcoded, so the copy can't go stale. */
const span = computed(() => {
  const years = layers.value.map((l) => l.map.year)
  if (!years.length) return null
  return { count: years.length, from: Math.min(...years), to: Math.max(...years) }
})

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="aboutOpen" class="backdrop" @click.self="close">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="About this project">
        <header>
          <div>
            <h2>San Diego History Map</h2>
            <p class="sub">Historical maps, laid over the city as it is now</p>
          </div>
          <button class="icon" type="button" title="Close" @click="close">
            <span class="sr-only">Close</span>
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="body">
          <p>
            This site collects scanned historical maps of San Diego, georeferenced so each one lines up with the modern
            map underneath it.<template v-if="span">
              There are {{ span.count }} at the moment, spanning {{ span.from }} to {{ span.to }}.</template>
            Turn layers on and off with the eye, fade between them with the opacity slider, and restack them to compare
            two eras directly.
          </p>

          <p>
            Some maps carry annotations — outlined places you can click for notes and photographs about what stood
            there.
          </p>

          <h3>Found a problem?</h3>
          <p>
            Corrections are welcome, and so are requests. If a map is misaligned, an annotation is wrong, or there's a
            San Diego map you'd like to see added, please open an issue on GitHub.
          </p>

          <h3>Credits</h3>
          <p>
            Scans come from the David Rumsey Map Collection, the Library of Congress, and other archives — each map's
            info panel links back to the original. The base map is OpenFreeMap, rendered with MapLibre GL; the historical
            layers are served as PMTiles archives.
          </p>
        </div>

        <footer>
          <a class="button" :href="REPO" target="_blank" rel="noopener">View on GitHub ↗</a>
          <a class="button primary" :href="NEW_ISSUE" target="_blank" rel="noopener">Report an issue ↗</a>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 20, 28, 0.5);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  padding: 20px;
}

.dialog {
  width: min(540px, 100%);
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--line);
}
h2 {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}
.sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-dim);
}

.body {
  overflow-y: auto;
  padding: 16px 18px;
  font-size: 13px;
  line-height: 1.62;
}
.body > * + * {
  margin-top: 12px;
}
/* Outweighs the flow spacing above, so a heading gets room to start a section. */
.body > h3 {
  font-size: 13px;
  font-weight: 650;
  margin-top: 20px;
}

footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
}
</style>
