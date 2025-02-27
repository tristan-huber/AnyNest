import ClipperLib from "js-clipper";

// returns the area of the polygon, assuming no self-intersections

import FloatPoint from "./float-point";
import FloatRect from "./float-rect";
import { ArrayPolygon, ClipperPoint, Point } from "../interfaces";
import { FloatPolygon } from "./float-polygon";

//TODO: depreacete when polygone will be moved to class

// private shared variables/methods

// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: Array<Point>): number {
  const pointCount: number = polygon.length;
  let result: number = 0;
  let i: number = 0;
  let currentPoint: Point;
  let prevPoint: Point;

  for (i = 0; i < pointCount; ++i) {
    prevPoint = polygon.at((i - 1 + pointCount) % pointCount);
    currentPoint = polygon.at(i);
    result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
  }

  return 0.5 * result;
}

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: ArrayPolygon): FloatRect | null {
  if (polygon.points.length < 3) {
    return null;
  }

  const pointCount: number = polygon.points.length;
  const min: FloatPoint = FloatPoint.from(polygon.points.at(0));
  const max: FloatPoint = FloatPoint.from(polygon.points.at(0));
  let i: number = 0;

  for (i = 1; i < pointCount; ++i) {
    max.max(polygon.points.at(i));
    min.min(polygon.points.at(i));
  }

  return FloatRect.fromPoints(min, max);
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: Point, polygon: ArrayPolygon): boolean {
  if (polygon.points.length < 3) {
    return false;
  }

  const innerPoint: FloatPoint = FloatPoint.from(point);
  const pointCount = polygon.points.length;
  let result: boolean = false;
  let offset: FloatPoint = new FloatPoint(
    polygon.offsetx || 0,
    polygon.offsety || 0
  );
  const currentPoint: FloatPoint = new FloatPoint();
  const prevPoint: FloatPoint = new FloatPoint();
  let i: number = 0;

  for (i = 0; i < pointCount; ++i) {
    currentPoint.set(polygon.points.at(i)).add(offset);
    prevPoint.set(polygon.points.at((i - 1 + pointCount) % pointCount)).add(offset);

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

// jsClipper uses X/Y instead of x/y...
export function toClipperCoordinates(
  polygon: Array<Point>,
  scale: number = 1
): ClipperPoint[] {
  const size: number = polygon.length;
  const result: ClipperPoint[] = [];
  let i: number = 0;
  let point: Point;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({ X: point.x, Y: point.y });
  }

  if (scale !== 1) {
    ClipperLib.JS.ScaleUpPath(result, scale);
  }

  return result;
}

export function toNestCoordinates(
  polygon: ClipperPoint[],
  scale: number
): Array<Point> {
  const size: number = polygon.length;
  const result: Array<Point> = new Array<Point>();
  let i: number = 0;
  let point: ClipperPoint;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({
      x: point.X / scale,
      y: point.Y / scale
    });
  }

  return result;
}
