import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  ElementRef,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { TrackPoint } from '../kml-parser.service';

/**
 * Tile provider note:
 * This app uses the public OpenStreetMap tile server for personal local use only.
 * For any public-facing or higher-traffic deployment, use a dedicated tile provider
 * (e.g. a self-hosted tile server, MapTiler, Stadia Maps, etc.) instead of
 * tile.openstreetmap.org. See https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

/** Minimum zoom level at which point markers and time labels are shown. */
const LABEL_ZOOM_THRESHOLD = 16;

/** Minimum elapsed seconds between two consecutive time labels. */
const LABEL_MIN_SECONDS = 60;

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() points: TrackPoint[] = [];
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private polyline: L.Polyline | null = null;
  private labelsLayer: L.LayerGroup | null = null;

  ngAfterViewInit(): void {
    this.initMap();
    if (this.points.length > 0) {
      this.renderTrack();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['points'] && this.map) {
      this.renderTrack();
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, { preferCanvas: true }).setView([50, 20], 6);

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(this.map);

    this.labelsLayer = L.layerGroup().addTo(this.map);

    this.map.on('zoomend', () => this.updateLabels());
  }

  private renderTrack(): void {
    if (!this.map) return;

    this.polyline?.remove();
    this.polyline = null;
    this.labelsLayer?.clearLayers();

    if (this.points.length === 0) return;

    const latlngs = this.points.map((p) => [p.lat, p.lon] as L.LatLngTuple);

    this.polyline = L.polyline(latlngs, {
      color: '#0078ff',
      weight: 3,
      opacity: 0.85,
    }).addTo(this.map);

    this.map.fitBounds(this.polyline.getBounds(), { padding: [20, 20] });

    this.updateLabels();
  }

  private updateLabels(): void {
    if (!this.map || !this.labelsLayer) return;
    this.labelsLayer.clearLayers();

    const zoom = this.map.getZoom();
    if (zoom < LABEL_ZOOM_THRESHOLD || this.points.length === 0) return;

    let lastLabelTime: number | null = null;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];

      // Clickable dot marker for every point
      const dot = L.circleMarker([p.lat, p.lon], {
        radius: 4,
        color: '#004ea6',
        fillColor: '#0078ff',
        fillOpacity: 0.9,
        weight: 1,
      });

      let popup = `<b>Point ${i + 1}</b><br>`;
      if (p.timestamp) {
        const d = new Date(p.timestamp);
        if (!isNaN(d.getTime())) {
          popup += `Time: ${d.toLocaleString()}<br>`;
        }
      }
      popup += `Lat: ${p.lat.toFixed(6)}<br>Lon: ${p.lon.toFixed(6)}`;
      if (p.altitude !== undefined) {
        popup += `<br>Alt: ${p.altitude.toFixed(1)} m`;
      }
      dot.bindPopup(popup);
      this.labelsLayer.addLayer(dot);

      // Time label, thinned by elapsed time
      if (p.timestamp) {
        const d = new Date(p.timestamp);
        if (!isNaN(d.getTime())) {
          const ms = d.getTime();
          if (lastLabelTime === null || ms - lastLabelTime >= LABEL_MIN_SECONDS * 1000) {
            const label = L.marker([p.lat, p.lon], {
              icon: L.divIcon({
                className: 'time-label',
                html: `<span>${d.toLocaleTimeString()}</span>`,
                iconSize: undefined,
                iconAnchor: [0, 0],
              }),
              interactive: false,
              zIndexOffset: 100,
            });
            this.labelsLayer.addLayer(label);
            lastLabelTime = ms;
          }
        }
      }
    }
  }
}
