<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { infoMapId, layerAt } from '../store'
import type { HistoricalMap } from '../types'

const emit = defineEmits<{ zoom: [map: HistoricalMap] }>()

const map = computed(() => (infoMapId.value ? layerAt(infoMapId.value)?.map : undefined))

const close = () => (infoMapId.value = null)

const facts = computed(() => {
  const m = map.value
  if (!m) return []
  const [w, s, e, n] = m.bounds
  return [
    ['Year', String(m.year)],
    ['Author', m.author],
    ['Publisher', m.publisher],
    ['Archive', m.source],
    ['Zoom range', `${m.minzoom} – ${m.maxzoom}`],
    ['Tiles', `${m.tileType.toUpperCase()} · ${m.tileSize}px`],
    ['Extent', `${s.toFixed(3)}, ${w.toFixed(3)} → ${n.toFixed(3)}, ${e.toFixed(3)}`],
    ['File', m.file],
  ].filter((row): row is [string, string] => Boolean(row[1]))
})

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="map" class="backdrop" @click.self="close">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="map.title">
        <header>
          <div>
            <h2>{{ map.title }}</h2>
            <p class="sub">{{ map.year }}<template v-if="map.author"> · {{ map.author }}</template></p>
          </div>
          <button class="icon" type="button" title="Close" @click="close">
            <span class="sr-only">Close</span>
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="body">
          <p v-if="map.description" class="description">{{ map.description }}</p>

          <dl class="facts">
            <template v-for="[label, value] in facts" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ value }}</dd>
            </template>
          </dl>
        </div>

        <footer>
          <a v-if="map.src_url" class="button" :href="map.src_url" target="_blank" rel="noopener">
            View original scan ↗
          </a>
          <button class="button primary" type="button" @click="emit('zoom', map); close()">Zoom to extent</button>
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
}
.description {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
}

.facts {
  margin-top: 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  font-size: 12px;
}
dt {
  color: var(--text-dim);
}
dd {
  word-break: break-word;
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
