import * as L from 'leaflet';

const APP_ID = 'io.github.jakubhalun.kml_route_viewer';

// Browsers omit Referer for file:// pages. OSM accepts an app ID in
// X-Requested-With, which requires fetch instead of a direct image URL.
export class LocalFileTileLayer extends L.TileLayer {
  private readonly pendingTiles = new WeakMap<HTMLElement, AbortController>();

  constructor(url: string, options: L.TileLayerOptions) {
    super(url, options);
    const cancelTile = ({ tile }: L.TileEvent) => this.pendingTiles.get(tile)?.abort();
    this.on('tileunload', cancelTile);
    this.on('tileabort', cancelTile);
  }

  protected override createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement {
    const tile = document.createElement('img');
    tile.alt = '';
    const controller = new AbortController();
    this.pendingTiles.set(tile, controller);

    void this.loadImage(this.getTileUrl(coords), tile, controller.signal).then(
      () => {
        this.pendingTiles.delete(tile);
        if (!controller.signal.aborted) done(undefined, tile);
      },
      (error: Error) => {
        this.pendingTiles.delete(tile);
        if (!controller.signal.aborted) done(error, tile);
      },
    );

    return tile;
  }

  private async loadImage(url: string, tile: HTMLImageElement, signal: AbortSignal): Promise<void> {
    const response = await fetch(url, {
      headers: { 'X-Requested-With': APP_ID },
      signal,
    });
    if (!response.ok) throw new Error(`Tile request failed (HTTP ${response.status})`);

    const image = await response.blob();
    signal.throwIfAborted();
    const objectUrl = URL.createObjectURL(image);
    try {
      tile.src = objectUrl;
      await tile.decode();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
