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
  /**
   * Parses a KML document into an ordered list of track points.
   *
   * Different exporters encode a track in different ways, so several strategies are
   * tried in order of trustworthiness and the first one that yields points wins:
   *
   *   1. <gx:Track>                     – Geo Tracker and similar GPS loggers
   *   2. timestamped <Point> placemarks – Flightradar24 ("Route" folder)
   *   3. <LineString> / <LinearRing>    – plain Google Earth path exports
   *   4. untimed <Point> placemarks     – last resort
   *
   * Trying <gx:Track> first also means a Geo Tracker file that additionally carries
   * a couple of start/end <Point> waypoints is parsed exactly as before, and a
   * Flightradar24 file is read from its "Route" folder rather than from the "Trail"
   * folder, which duplicates the same geometry without timestamps.
   */
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

    // Each strategy collects its own warnings; only the warnings of the strategy
    // that actually produced the track are reported, so a file in a supported
    // non-gx:Track format does not show a misleading "no gx:Track" message.
    const strategies: ((warnings: string[]) => TrackPoint[])[] = [
      (w) => this.parseGxTracks(doc, w),
      (w) => this.parsePlacemarkPoints(doc, w, true),
      (w) => this.parseLineStrings(doc, w),
      (w) => this.parsePlacemarkPoints(doc, w, false),
    ];

    for (const strategy of strategies) {
      const warnings: string[] = [];
      const points = strategy(warnings);
      if (points.length > 0) {
        return { points, errors: warnings };
      }
    }

    errors.push(
      'No track data found: the file contains no <gx:Track>, <LineString>, or <Point> placemarks with usable coordinates.',
    );
    return { points: [], errors };
  }

  /** Strategy 1: <gx:Track> with paired <when> / <gx:coord> children. */
  private parseGxTracks(doc: Document, errors: string[]): TrackPoint[] {
    const trackElements = doc.getElementsByTagNameNS(GX_NS, 'Track');
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
        const timestamp = whenEls[i]?.textContent?.trim() || undefined;

        // gx:coord is space separated: "lon lat alt"
        const point = this.makePoint(coordText.split(/\s+/), timestamp);

        if (!point) {
          errors.push(`${trackLabel}, point ${i + 1}: Unreadable coordinate "${coordText}". Skipping point.`);
          continue;
        }

        points.push(point);
      }
    }

    return points;
  }

  /**
   * Strategies 2 and 4: one <Point> placemark per fix, in document order.
   *
   * Flightradar24 exports the flight path this way, each placemark carrying its own
   * <TimeStamp><when>. With `requireTimestamp` such placemarks are only accepted when
   * at least two of them are timestamped, which keeps a stray untimed waypoint from
   * being mistaken for a track before the <LineString> strategy gets a chance.
   */
  private parsePlacemarkPoints(
    doc: Document,
    errors: string[],
    requireTimestamp: boolean,
  ): TrackPoint[] {
    const placemarks = doc.getElementsByTagName('Placemark');
    const points: TrackPoint[] = [];

    for (let p = 0; p < placemarks.length; p++) {
      const placemark = placemarks[p];
      const timestamp = this.findTimestamp(placemark);

      if (requireTimestamp && !timestamp) continue;

      const coordEls = this.collectCoordinates(placemark, ['Point']);

      for (const coordEl of coordEls) {
        const coordText = coordEl.textContent?.trim() ?? '';
        // <coordinates> is comma separated: "lon,lat,alt"
        const point = this.makePoint(coordText.split(','), timestamp);

        if (!point) {
          errors.push(`Placemark ${p + 1}: Unreadable coordinate "${coordText}". Skipping point.`);
          continue;
        }

        points.push(point);
      }
    }

    if (points.length < 2) return [];

    return points;
  }

  /** Strategy 3: <LineString> / <LinearRing> geometries, concatenated in document order. */
  private parseLineStrings(doc: Document, errors: string[]): TrackPoint[] {
    const coordEls = this.collectCoordinates(doc.documentElement, ['LineString', 'LinearRing']);
    const points: TrackPoint[] = [];

    for (const coordEl of coordEls) {
      const tuples = (coordEl.textContent ?? '').trim().split(/\s+/);

      for (const tuple of tuples) {
        if (!tuple) continue;

        const point = this.makePoint(tuple.split(','), undefined);

        if (!point) {
          errors.push(`LineString: Unreadable coordinate "${tuple}". Skipping point.`);
          continue;
        }

        points.push(point);
      }
    }

    return points;
  }

  /**
   * Returns the <coordinates> elements of the given geometry types found beneath
   * `root` (directly or wrapped in a <MultiGeometry>), in document order.
   */
  private collectCoordinates(root: Element, geometryNames: string[]): Element[] {
    const result: Element[] = [];
    const coordEls = root.getElementsByTagName('coordinates');

    for (let i = 0; i < coordEls.length; i++) {
      const parent = coordEls[i].parentElement;
      if (parent && geometryNames.includes(parent.localName)) {
        result.push(coordEls[i]);
      }
    }

    return result;
  }

  /** First <when> beneath a placemark, whether it sits in a <TimeStamp> or a <TimeSpan>. */
  private findTimestamp(placemark: Element): string | undefined {
    const whenEls = placemark.getElementsByTagName('when');
    return whenEls.length > 0 ? whenEls[0].textContent?.trim() || undefined : undefined;
  }

  /** Builds a track point from "lon", "lat" and optional "alt" (metres) tokens. */
  private makePoint(parts: string[], timestamp: string | undefined): TrackPoint | null {
    if (parts.length < 2) return null;

    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const alt = parts.length >= 3 ? parseFloat(parts[2]) : undefined;

    if (!isFinite(lon) || !isFinite(lat)) return null;

    return {
      lat,
      lon,
      altitude: alt !== undefined && isFinite(alt) ? alt : undefined,
      timestamp,
    };
  }
}
