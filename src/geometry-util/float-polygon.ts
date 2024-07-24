import ClipperLib from "js-clipper";
import FloatPoint from "./float-point";
import FloatRect from "./float-rect";
import { Point, ArrayPolygon, BoundRect, ClipperPoint } from "../interfaces";
import { almostEqual } from "../util";
import { toNestCoordinates, toClipperCoordinates } from "./geometry-utils";

/**
 * Represents a mutable polygon in 2D space.
 * 
 * Provides some core polygon behavior natively like: bounds, translate, rotate.
 * 
 * Note that some more advanced operations (eg: offset) are provided through Clipper.js. Clipper.js
 * performs all operations in integer coordinate space, therefore these advanced operations require
 * additional parameters which define the accuracy to execute the operation.
 */
export default class FloatPolygon extends Array<FloatPoint> implements ArrayPolygon, BoundRect {
  private _id: number = -1;
  private _bounds: FloatRect | null;
  private _area: number = 0;
  private _isValid: boolean;
  private _offset: FloatPoint;
  private _children: FloatPolygon[];
  private _source: number;
  private _rotation: number;

  private constructor() {
    super();
  }

  /**
   * Get a new FloatPolygon using the given set of points.
   *
   * @param points 
   * @param source 
   * @returns 
   */
  public static fromPoints(points: Array<Point> = [], source?: number): FloatPolygon {
    var result: FloatPolygon = new FloatPolygon();

    result.updatePoints(points);
    result._children = [];

    if (typeof source !== 'undefined') {
      result._source = source;
    }

    result._offset = new FloatPoint();

    return result;
  }

  /**
   * Update the points in this polygon. Note that the resulting polygon may
   * store slightly different points at the end of this operation because 1) we enforce a
   * uniform winding direction on all polygons and 2) shared start/end points are deduplicated.
   */
  public updatePoints(points: Array<Point>) {
    while (this.length > 0) {
      this.pop();
    }
    points.map((p) => this.push(FloatPoint.from(p)));

    this._isValid = this.length >= 3;

    if (!this._isValid) {
      return;
    }

    this._bounds = this._computeBounds();
    this._area = this._getArea();
    // Ensure a uniform winding direction for all Polygons.
    if (this._area > 0) {
      this.reverse();
      this._area = this._getArea();
    }

    // Don't allow shared start/end points. All polygons are implicitly loops already.
    if (this[0] === this.at(-1) || FloatPoint.almostEqual(this[0], this.at(-1))) {
      this.pop();
    }
  }

  // TODO: this doesn't operate as a mutation method, probably should be updated.
  public rotate(angle: number): FloatPolygon {
    const points: Array<Point> = new Array<Point>();
    const pointCount: number = this.length;
    const radianAngle: number = (angle * Math.PI) / 180;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
      points.push(this[i].clone().rotate(radianAngle));
    }

    const result = FloatPolygon.fromPoints(points);

    if (this.hasChildren) {
      const childCount: number = this.childCount;

      for (i = 0; i < childCount; ++i) {
        result.children.push(this._children[i].rotate(angle));
      }
    }

    return result;
  }

  /**
   * Moves this polygon by the specified vector. Positive x value moves "right",
   * positive y value moves "up".
   */
  public translate(vector: FloatPoint) {
    this.map((point: FloatPoint) => {
      point.add(vector);
    });
  }

  // return true if point is in the polygon, false if outside, and null if exactly on a point or edge
  public pointIn(point: Point): boolean {
    if (!this._isValid) {
      return false;
    }

    const innerPoint: FloatPoint = FloatPoint.from(point);
    const pointCount = this.length;
    let result: boolean = false;
    const currentPoint: FloatPoint = new FloatPoint();
    const prevPoint: FloatPoint = new FloatPoint();
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
      currentPoint.set(this[i]).add(this._offset);
      prevPoint
        .set(this[(i - 1 + pointCount) % pointCount])
        .add(this._offset);

      if (
        innerPoint.almostEqual(currentPoint) ||
        innerPoint.onSegment(currentPoint, prevPoint)
      ) {
        return false; // no result or exactly on the segment
      }

      if (FloatPoint.almostEqual(currentPoint, prevPoint)) {
        // ignore very small lines
        continue;
      }

      if (
        currentPoint.y - point.y > 0 !== prevPoint.y - point.y > 0 &&
        point.x - currentPoint.x <
        ((prevPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (prevPoint.y - currentPoint.y)
      ) {
        result = !result;
      }
    }

    return result;
  }

  // Note: for some polygons a negative offset will result in multiple polygons.
  // This case is not currently supported.
  public polygonOffset(offset: number, clipperScale: number, curveTolerance: number) {
    if (almostEqual(offset, 0)) {
      return;
    }

    const p: ClipperPoint[] = toClipperCoordinates(this, clipperScale);
    const miterLimit: number = 2;
    const co = new ClipperLib.ClipperOffset(
      miterLimit,
      curveTolerance * clipperScale
    );
    co.AddPath(
      p,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon
    );

    const newPaths = new ClipperLib.Paths();
    co.Execute(newPaths, offset * clipperScale);

    if (newPaths.length > 1) {
      throw new Error("Bin offset too large and generated multiple bin spaces. This is not currently supported");
    }

    this.updatePoints(toNestCoordinates(newPaths[0], clipperScale));
  }

  private _computeBounds(): FloatRect | null {
    if (!this._isValid) {
      return null;
    }

    let point: FloatPoint = this[0];
    const pointCount: number = this.length;
    const min: FloatPoint = FloatPoint.from(point);
    const max: FloatPoint = FloatPoint.from(point);
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
      point = this[i];
      max.max(point);
      min.min(point);
    }

    return FloatRect.fromPoints(min, max);
  }

  private _getArea(): number {
    const pointCount: number = this.length;
    let result: number = 0;
    let i: number = 0;
    let currentPoint: Point;
    let prevPoint: Point;

    for (i = 0; i < pointCount; ++i) {
      prevPoint = this[(i - 1 + pointCount) % pointCount];
      currentPoint = this[i];
      result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
    }

    return 0.5 * result;
  }

  public get isValid(): boolean {
    return this._isValid;
  }

  public get length(): number {
    return this.length;
  }

  public get bound(): FloatRect | null {
    return this._bounds;
  }

  public get area(): number {
    return this._area;
  }

  public get firstPoint(): FloatPoint | null {
    return this[0] || null;
  }

  public get x(): number {
    return this._bounds ? this._bounds.x : 0;
  }

  public get y(): number {
    return this._bounds ? this._bounds.y : 0;
  }

  public get width(): number {
    return this._bounds !== null ? this._bounds.width : 0;
  }

  public get height(): number {
    return this._bounds !== null ? this._bounds.height : 0;
  }

  public get id(): number {
    return this._id;
  }

  public get offsetx(): number {
    return this._offset.x;
  }

  public get offsety(): number {
    return this._offset.y;
  }

  public get offset(): FloatPoint {
    return this._offset;
  }

  public get min(): FloatPoint {
    const result = FloatPoint.from(this[0]);
    let i: number = 0;
    const pointCount = this.length;

    for (i = 1; i < pointCount; ++i) {
      result.min(this[i]);
    }

    return result;
  }

  public get max(): FloatPoint {
    const result = FloatPoint.from(this[0]);
    let i: number = 0;
    const pointCount = this.length;

    for (i = 1; i < pointCount; ++i) {
      result.max(this[i]);
    }

    return result;
  }

  public get children(): Array<FloatPolygon> {
    return this._children;
  }

  public get hasChildren(): boolean {
    return this._children.length > 0;
  }

  public get childCount(): number {
    return this._children.length;
  }

  public get source(): number {
    return this._source;
  }

  public get rotation(): number {
    return this._rotation;
  }

  public get bounds(): BoundRect {
    return this._bounds;
  }
}
