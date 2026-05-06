import { Injectable } from '@angular/core';

export interface TrackPoint {
  lat: number;
  lon: number;
  altitude?: number;
  timestamp?: string;
}

export interface ParseResult {
  points: TrackPoint[];
  errors: string[];
}

const GX_NS = 'http://www.google.com/kml/ext/2.2';

@Injectable({ providedIn: 'root' })
export class KmlParserService {
  parse(kmlText: string): ParseResult {
    const errors: string[] = [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlText, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      const msg = parseError.textContent?.trim() ?? 'Unknown parse error';
      errors.push(`Invalid XML: ${msg}`);
      return { points: [], errors };
    }

    const trackElements = doc.getElementsByTagNameNS(GX_NS, 'Track');

    if (trackElements.length === 0) {
      errors.push('No gx:Track elements found in the KML file.');
      return { points: [], errors };
    }

    const points: TrackPoint[] = [];

    for (let t = 0; t < trackElements.length; t++) {
      const track = trackElements[t];
      const trackLabel = `Track ${t + 1}`;

      // Collect <when> and <gx:coord> children by local name.
      // Elements may be interleaved or grouped – collect independently and pair by index.
      const whenEls: Element[] = [];
      const coordEls: Element[] = [];

      for (let i = 0; i < track.children.length; i++) {
        const child = track.children[i];
        if (child.localName === 'when') whenEls.push(child);
        if (child.localName === 'coord') coordEls.push(child);
      }

      if (coordEls.length === 0) {
        errors.push(`${trackLabel}: no gx:coord elements found. Skipping.`);
        continue;
      }

      if (whenEls.length !== coordEls.length && whenEls.length !== 0) {
        errors.push(
          `${trackLabel}: <when> count (${whenEls.length}) differs from <gx:coord> count (${coordEls.length}). ` +
            `Pairing up to the shorter length.`,
        );
      }

      const pairCount = whenEls.length === 0 ? coordEls.length : Math.min(whenEls.length, coordEls.length);

      for (let i = 0; i < pairCount; i++) {
        const coordText = coordEls[i].textContent?.trim() ?? '';
        const parts = coordText.split(/\s+/);

        if (parts.length < 2) {
          errors.push(`${trackLabel}, point ${i + 1}: Unreadable coordinate "${coordText}". Skipping point.`);
          continue;
        }

        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : undefined;

        if (!isFinite(lon) || !isFinite(lat)) {
          errors.push(`${trackLabel}, point ${i + 1}: Non-numeric coordinate "${coordText}". Skipping point.`);
          continue;
        }

        const timestamp = whenEls[i]?.textContent?.trim() || undefined;

        points.push({
          lat,
          lon,
          altitude: alt !== undefined && isFinite(alt) ? alt : undefined,
          timestamp,
        });
      }
    }

    if (points.length === 0 && errors.length === 0) {
      errors.push('No valid track points found in the KML file.');
    }

    return { points, errors };
  }
}
