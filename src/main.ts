import { createApp } from 'vue'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App.vue'

// Teaches MapLibre to resolve pmtiles:// URLs by ranged-reading the archive.
maplibregl.addProtocol('pmtiles', new Protocol().tile)

createApp(App).mount('#app')
