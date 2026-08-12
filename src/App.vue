<script setup lang="ts">
import { onMounted, ref } from 'vue'
import MapCanvas from './components/MapCanvas.vue'
import LayerDrawer from './components/LayerDrawer.vue'
import MapInfoDialog from './components/MapInfoDialog.vue'
import { drawerOpen, loadManifest } from './store'
import type { HistoricalMap } from './types'

const canvas = ref<InstanceType<typeof MapCanvas>>()

const zoomTo = (map: HistoricalMap) => canvas.value?.flyTo(map)

onMounted(() => loadManifest())
</script>

<template>
  <main>
    <MapCanvas ref="canvas" />

    <button v-if="!drawerOpen" class="drawer-toggle" type="button" @click="drawerOpen = true">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      Layers
    </button>

    <LayerDrawer @zoom="zoomTo" />
    <MapInfoDialog @zoom="zoomTo" />
  </main>
</template>

<style scoped>
main {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.drawer-toggle {
  position: absolute;
  z-index: 4;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  font-size: 13px;
  font-weight: 550;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9px;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.drawer-toggle:hover {
  background: var(--surface-2);
}
</style>
