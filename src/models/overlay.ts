/** Port of `app/models/overlay.py`. */
export type Box = [number, number, number, number];
export type Dimensions = [number, number];

export interface OverlayData {
  center_x: number;
  center_y: number;
  angle: number;
  scale: number;
  start: number;
  stop: number;
}

export class Overlay implements OverlayData {
  center_x = 0.5;
  center_y = 0.5;
  angle = 0.0;
  scale = 0.25;
  start = 0.0;
  stop = 1.0;

  constructor(data: Partial<OverlayData> = {}) {
    Object.assign(this, data);
  }

  clone(): Overlay {
    return new Overlay(this.toJSON());
  }

  toJSON(): OverlayData {
    const { center_x, center_y, angle, scale, start, stop } = this;
    return { center_x, center_y, angle, scale, start, stop };
  }

  /** Python `str(Overlay(...))` — used inside cache fingerprints. */
  toString(): string {
    const { center_x, center_y, angle, scale, start, stop } = this;
    return `Overlay(center_x=${center_x}, center_y=${center_y}, angle=${angle}, scale=${scale}, start=${start}, stop=${stop})`;
  }

  isDefault(): boolean {
    return this.toString() === new Overlay().toString();
  }

  get timed(): boolean {
    return !(this.start === 0.0 && this.stop === 1.0);
  }

  visibleAt(percentRendered: number): boolean {
    return this.start <= percentRendered && percentRendered < this.stop;
  }

  getSize(backgroundSize: Dimensions): Dimensions {
    const [backgroundWidth, backgroundHeight] = backgroundSize;
    const dimension = Math.min(
      Math.trunc(backgroundWidth * this.scale),
      Math.trunc(backgroundHeight * this.scale),
    );
    return [dimension, dimension];
  }

  getBox(backgroundSize: Dimensions, foregroundSize?: Dimensions): Box {
    const [backgroundWidth, backgroundHeight] = backgroundSize;
    const [foregroundWidth, foregroundHeight] = foregroundSize ?? this.getSize(backgroundSize);
    return [
      Math.trunc(backgroundWidth * this.center_x - foregroundWidth / 2),
      Math.trunc(backgroundHeight * this.center_y - foregroundHeight / 2),
      Math.trunc(backgroundWidth * this.center_x + foregroundWidth / 2),
      Math.trunc(backgroundHeight * this.center_y + foregroundHeight / 2),
    ];
  }
}
