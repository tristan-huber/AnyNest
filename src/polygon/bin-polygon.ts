import FloatPoint from "../geometry-util/float-point";
import FloatRect from "../geometry-util/float-rect";
import { getPolygonBounds, polygonArea } from "../geometry-util";
import { ArrayPolygon, SvgNestConfiguration } from "../interfaces";
import SharedPolygon from "./shared-polygon";

export default class BinPolygon extends SharedPolygon {
  private _polygon: FloatPolygon;

  constructor(polygon: FloatPolygon, configuration: SvgNestConfiguration) {
    super(configuration);

    this._polygon = polygon;

    // TODO: this should be a thrown error
    if (!this._polygon.isValid) {
      return;
    }


    if (this.spacing > 0) {
      // This bound might need to be intependently configurable for the CNC use case.
      // some beds might have restrictions (like the tool always needs to be 100% within the material)
      const offsetBin = this._polygonOffset(
        this._polygon,
        -0.5 * this.spacing
      );

      if (offsetBin.length == 1) {
        // if the offset contains 0 or more than 1 path, something went wrong.
        this._polygon.updatePoints(offsetBin[0]);
      } else {
        console.log("offset failure");
      }
    }

    this._polygon.id = -1;

    let point = this._polygon[0];
    // put bin on origin
    let max = FloatPoint.from(point);
    let min = FloatPoint.from(point);

    let i = 0;
    const binSize = this._polygon.length;

    for (i = 1; i < binSize; ++i) {
      point = this._polygon[i];
      min.min(point);
      max.max(point);
    }

    for (i = 0; i < binSize; ++i) {
      point = this._polygon[i];
      point.x -= min.x;
      point.y -= min.y;
    }

    this._polygon.bounds.width = max.x - min.x;
    this._polygon.bounds.height = max.y - min.y;

    this._area = polygonArea(this._polygon);

    // all paths need to have the same winding direction
    if (this._area > 0) {
      this._polygon.reverse();
      this._area = polygonArea(this._polygon);
    }
  }

  public get isValid(): boolean {
    return this._isValid;
  }

  public get bounds(): FloatRect | null {
    return this._bounds;
  }

  public get polygon(): ArrayPolygon {
    return this._polygon;
  }

  public get area(): number {
    return this._area;
  }
}
