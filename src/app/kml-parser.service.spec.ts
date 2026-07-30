import { KmlParserService } from './kml-parser.service';

/** Geo Tracker style: gx:MultiTrack with grouped <when> and <gx:coord> children. */
const GX_TRACK_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Placemark>
      <gx:MultiTrack>
        <gx:Track>
          <when>2026-01-01T09:01:52Z</when>
          <when>2026-01-01T09:01:57Z</when>
          <gx:coord>19.89075 50.01515 287.34</gx:coord>
          <gx:coord>19.89080 50.01520 288.10</gx:coord>
        </gx:Track>
      </gx:MultiTrack>
    </Placemark>
  </Document>
</kml>`;

/** Geo Tracker files may add start/end waypoints next to the track – the track must still win. */
const GX_TRACK_WITH_WAYPOINTS_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Placemark>
      <name>Start</name>
      <TimeStamp><when>2026-01-01T09:01:52Z</when></TimeStamp>
      <Point><coordinates>1.0,2.0,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Finish</name>
      <TimeStamp><when>2026-01-01T09:01:57Z</when></TimeStamp>
      <Point><coordinates>3.0,4.0,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <gx:Track>
        <when>2026-01-01T09:01:52Z</when>
        <gx:coord>19.89075 50.01515 287.34</gx:coord>
        <when>2026-01-01T09:01:57Z</when>
        <gx:coord>19.89080 50.01520 288.10</gx:coord>
      </gx:Track>
    </Placemark>
  </Document>
</kml>`;

/**
 * Flightradar24 style: a "Route" folder of timestamped <Point> placemarks plus a
 * "Trail" folder repeating the same geometry as untimed LineString segments.
 */
const FLIGHTRADAR_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>Route</name>
      <Placemark>
        <name>2026-06-07 08:33:46 UTC</name>
        <description><![CDATA[<div><b>Altitude:</b> 0 ft</div>]]></description>
        <TimeStamp><when>2026-06-07T08:33:46+00:00</when></TimeStamp>
        <Point><altitudeMode>absolute</altitudeMode><coordinates>28.737961,41.265404,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <TimeStamp><when>2026-06-07T09:48:22+00:00</when></TimeStamp>
        <Point><coordinates>24.451241,46.242386,11582.4</coordinates></Point>
      </Placemark>
      <Placemark>
        <TimeStamp><when>2026-06-07T10:45:28+00:00</when></TimeStamp>
        <Point><coordinates>19.802423,50.073635,0</coordinates></Point>
      </Placemark>
    </Folder>
    <Folder>
      <name>Trail</name>
      <Placemark>
        <MultiGeometry>
          <LineString><coordinates>28.737961,41.265404,0 24.451241,46.242386,11582.4</coordinates></LineString>
        </MultiGeometry>
        <name>P-1</name>
      </Placemark>
      <Placemark>
        <MultiGeometry>
          <LineString><coordinates>24.451241,46.242386,11582.4 19.802423,50.073635,0</coordinates></LineString>
        </MultiGeometry>
        <name>P-2</name>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

/** Plain Google Earth path export: a single LineString, no timestamps. */
const LINESTRING_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>
          19.10,50.10,100 19.20,50.20,200
          19.30,50.30,300
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

/** Geo Tracker export of an aborted recording: styles and schema only, no geometry. */
const EMPTY_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Empty recording</name>
    <Style id="track"><LineStyle><color>ffff0000</color><width>4</width></LineStyle></Style>
  </Document>
</kml>`;

describe('KmlParserService', () => {
  let service: KmlParserService;

  beforeEach(() => {
    service = new KmlParserService();
  });

  it('parses gx:Track points with their timestamps', () => {
    const result = service.parse(GX_TRACK_KML);

    expect(result.errors).toEqual([]);
    expect(result.points.length).toBe(2);
    expect(result.points[0]).toEqual({
      lat: 50.01515,
      lon: 19.89075,
      altitude: 287.34,
      timestamp: '2026-01-01T09:01:52Z',
    });
    expect(result.points[1].lat).toBeCloseTo(50.0152, 5);
  });

  it('prefers gx:Track over Point placemarks in the same document', () => {
    const result = service.parse(GX_TRACK_WITH_WAYPOINTS_KML);

    expect(result.errors).toEqual([]);
    expect(result.points.length).toBe(2);
    // Waypoint coordinates (1,2) and (3,4) must not appear in the track.
    expect(result.points.every((p) => p.lon > 19 && p.lat > 50)).toBe(true);
  });

  it('parses Flightradar24 route placemarks without duplicating the trail', () => {
    const result = service.parse(FLIGHTRADAR_KML);

    expect(result.errors).toEqual([]);
    expect(result.points.length).toBe(3);
    expect(result.points[0].lat).toBeCloseTo(41.265404, 6);
    expect(result.points[0].lon).toBeCloseTo(28.737961, 6);
    expect(result.points[0].timestamp).toBe('2026-06-07T08:33:46+00:00');
    // Altitude comes from the third <coordinates> value and is already in metres.
    expect(result.points[1].altitude).toBeCloseTo(11582.4, 1);
    expect(result.points[2].timestamp).toBe('2026-06-07T10:45:28+00:00');
  });

  it('falls back to LineString coordinates when there is no track and no timestamped points', () => {
    const result = service.parse(LINESTRING_KML);

    expect(result.errors).toEqual([]);
    expect(result.points.length).toBe(3);
    expect(result.points[0]).toEqual({ lat: 50.1, lon: 19.1, altitude: 100, timestamp: undefined });
    expect(result.points[2].lat).toBeCloseTo(50.3, 5);
  });

  it('reports an error when the document contains no usable geometry', () => {
    const result = service.parse(EMPTY_KML);

    expect(result.points).toEqual([]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('No track data found');
  });

  it('reports invalid XML', () => {
    const result = service.parse('<kml><Document></kml>');

    expect(result.points).toEqual([]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Invalid XML');
  });
});
