import { Component, signal } from '@angular/core';
import { KmlParserService, TrackPoint } from './kml-parser.service';
import { MapComponent } from './map/map.component';

interface TrackSummary {
  fileName: string;
  pointCount: number;
  startTime: string | null;
  endTime: string | null;
  duration: string | null;
}

@Component({
  selector: 'app-root',
  imports: [MapComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly points = signal<TrackPoint[]>([]);
  readonly errors = signal<string[]>([]);
  readonly summary = signal<TrackSummary | null>(null);
  selectedFileName = '';

  constructor(private kmlParser: KmlParserService) {}

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.selectedFileName = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = this.kmlParser.parse(text);

      this.points.set(result.points);
      this.errors.set(result.errors);

      if (result.points.length > 0) {
        const times = result.points
          .filter((p) => p.timestamp)
          .map((p) => new Date(p.timestamp!).getTime())
          .filter((t) => !isNaN(t));

        const startTime = times.length > 0 ? new Date(Math.min(...times)).toLocaleString() : null;
        const endTime = times.length > 0 ? new Date(Math.max(...times)).toLocaleString() : null;

        let duration: string | null = null;
        if (times.length >= 2) {
          const ms = Math.max(...times) - Math.min(...times);
          const h = Math.floor(ms / 3_600_000);
          const m = Math.floor((ms % 3_600_000) / 60_000);
          const s = Math.floor((ms % 60_000) / 1_000);
          duration = `${h}h ${m}m ${s}s`;
        }

        this.summary.set({ fileName: file.name, pointCount: result.points.length, startTime, endTime, duration });
      } else {
        this.summary.set(null);
      }
    };
    reader.readAsText(file);
  }
}
