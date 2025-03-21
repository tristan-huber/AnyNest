//@ts-ignore
import ClipperLib from "js-clipper";
import {
  polygonArea,
  getPolygonBounds,
  toClipperCoordinates,
  toNestCoordinates
} from "../../geometry-util";
import { generateNFPCacheKey } from "../../util";
import FloatPoint from "../../geometry-util/float-point";
import { almostEqual } from "../../util";
import {
  ArrayPolygon,
  ClipperPoint,
  PlaceDataResult,
  PlacePairConfiguration,
  Placement,
  Point
} from "../../interfaces";
import { FloatPolygon } from "../../geometry-util/float-polygon";

export default function placePaths(
  inputPaths: Array<ArrayPolygon>,
  env: PlacePairConfiguration
): PlaceDataResult {
  if (!env.binPolygon) {
    return null;
  }

  // rotate paths by given rotation
  const paths = [];
  const allPlacements: Placement[][] = [];
  const binArea: number = Math.abs(env.binPolygon.area);
  let i: number = 0;
  let j: number = 0;
  let k: number = 0;
  let m: number = 0;
  let n: number = 0;
  let path: ArrayPolygon;
  let rotatedPath: ArrayPolygon;
  let fitness: number = 0;
  let nfp: ArrayPolygon[];
  let key: string;
  let placed: ArrayPolygon[];
  let placements: Placement[];
  let binNfp: ArrayPolygon[];
  let error: boolean;
  let position;
  let clipperBinNfp; // Array of clipper points
  let clipper;
  let combinedNfp;
  let finalNfp;
  let f;
  let allPoints: Array<Point>;
  let index;
  let rectBounds;
  let minWidth: number | null = null;
  let minArea: number | null = null;
  let minX: number | null = null;
  let nf;
  let area: number;
  let shiftVector: Placement;
  let clone: ClipperPoint[];
  const minScale: number =
    0.1 * env.config.clipperScale * env.config.clipperScale;
  const cleanTrashold: number = 0.0001 * env.config.clipperScale;
  const emptyPath: ArrayPolygon = { id: "", rotation: 0 } as ArrayPolygon;
  const rotations: number = env.config.rotations;

  for (i = 0; i < inputPaths.length; ++i) {
    path = inputPaths.at(i);
    rotatedPath = path.rotate(path.rotation);
    rotatedPath.rotation = path.rotation;
    paths.push(rotatedPath);
  }

  while (paths.length > 0) {
    placed = [];
    placements = [];
    fitness += 1; // add 1 for each new bin opened (lower fitness is better)

    for (i = 0; i < paths.length; ++i) {
      // TODO: where in this loop to we break for the second part in our two test cases?
      path = paths.at(i);

      // inner NFP
      key = generateNFPCacheKey(rotations, true, env.binPolygon, path);
      binNfp = env.nfpCache.get(key);

      // part unplaceable, skip
      if (!binNfp || binNfp.length == 0) {
        // TODO: I think this is where we catch if a single part us unplacably large.
        continue;
      }

      // ensure all necessary NFPs exist
      error = false;

      for (j = 0; j < placed.length; ++j) {
        key = generateNFPCacheKey(rotations, false, placed.at(j), path);

        if (!env.nfpCache.has(key)) {
          error = true;
          break;
        }
      }

      // part unplaceable, skip
      if (error) {
        continue;
      }

      position = null;

      if (placed.length == 0) {
        // first placement, put it on the left
        for (j = 0; j < binNfp.length; ++j) {
          let nfpPoly: ArrayPolygon = binNfp.at(j);
          for (k = 0; k < nfpPoly.points.length; ++k) {
            if (
              position === null ||
              nfpPoly.points.at(k).x - path.points.at(0).x < position.x
            ) {
              position = {
                translate: {
                  x: nfpPoly.points.at(k).x - path.points.at(0).x,
                  y: nfpPoly.points.at(k).y - path.points.at(0).y
                },
                id: path.id,
                rotate: path.rotation
              };
            }
          }
        }

        placements.push(position);
        placed.push(path);

        continue;
      }

      clipperBinNfp = [];

      for (j = 0; j < binNfp.length; ++j) {
        clipperBinNfp.push(toClipperCoordinates(binNfp.at(j).points));
      }

      ClipperLib.JS.ScaleUpPaths(clipperBinNfp, env.config.clipperScale);

      clipper = new ClipperLib.Clipper();
      combinedNfp = new ClipperLib.Paths();

      for (j = 0; j < placed.length; ++j) {
        key = generateNFPCacheKey(rotations, false, placed.at(j), path);

        if (!env.nfpCache.has(key)) {
          continue;
        }

        nfp = env.nfpCache.get(key);

        for (k = 0; k < nfp.length; ++k) {
          clone = toClipperCoordinates(nfp.at(k).points);
          for (m = 0; m < clone.length; ++m) {
            clone.at(m).X += placements.at(j).translate.x;
            clone.at(m).Y += placements.at(j).translate.y;
          }

          ClipperLib.JS.ScaleUpPath(clone, env.config.clipperScale);
          clone = ClipperLib.Clipper.CleanPolygon(clone, cleanTrashold);
          area = Math.abs(ClipperLib.Clipper.Area(clone));

          if (clone.length > 2 && area > minScale) {
            clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
          }
        }
      }

      if (
        !clipper.Execute(
          ClipperLib.ClipType.ctUnion,
          combinedNfp,
          ClipperLib.PolyFillType.pftNonZero,
          ClipperLib.PolyFillType.pftNonZero
        )
      ) {
        continue;
      }

      // difference with bin polygon
      finalNfp = new ClipperLib.Paths();
      clipper = new ClipperLib.Clipper();

      clipper.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true);
      clipper.AddPaths(clipperBinNfp, ClipperLib.PolyType.ptSubject, true);
      if (
        !clipper.Execute(
          ClipperLib.ClipType.ctDifference,
          finalNfp,
          ClipperLib.PolyFillType.pftNonZero,
          ClipperLib.PolyFillType.pftNonZero
        )
      ) {
        continue;
      }

      finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, cleanTrashold);

      for (j = 0; j < finalNfp.length; ++j) {
        area = Math.abs(ClipperLib.Clipper.Area(finalNfp.at(j)));

        // TODO: this < 3 check disallows perfect fits.
        if (finalNfp.at(j).length < 3 || area < minScale) {
          finalNfp.splice(j, 1);
          j--;
        }
      }

      if (!finalNfp || finalNfp.length == 0) {
        continue;
      }

      f = [];

      for (j = 0; j < finalNfp.length; ++j) {
        // back to normal scale
        f.push(toNestCoordinates(finalNfp.at(j), env.config.clipperScale));
      }

      // finalNfp is valid area for the bottom-left of the shape we're trying to place.
      // Such that it's within the bin and not intersecting any already-placed part.
      finalNfp = f;

      // choose placement that results in the smallest bounding box
      // could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers) which are not optimal for real-world use
      // todo: generalize gravity direction
      minWidth = null;
      minArea = null;
      minX = null;

      for (j = 0; j < finalNfp.length; ++j) {
        nf = finalNfp.at(j);

        for (k = 0; k < nf.length; ++k) {
          allPoints = new Array<Point>();

          for (m = 0; m < placed.length; ++m) {
            for (n = 0; n < placed.at(m).points.length; ++n) {
              allPoints.push(
                FloatPoint.from(placed.at(m).points.at(n)).add(placements.at(m).translate)
              );
            }
          }

          shiftVector = {
            translate: {
              x: nf.at(k).x - path.points.at(0).x,
              y: nf.at(k).y - path.points.at(0).y
            },
            id: path.id,
            rotate: path.rotation,
          };

          for (m = 0; m < path.points.length; ++m) {
            allPoints.push(FloatPoint.from(path.points.at(m)).add(shiftVector.translate));
          }

          rectBounds = getPolygonBounds(FloatPolygon.fromPoints(allPoints, ""));

          // weigh width more, to help compress in direction of gravity
          area = rectBounds.width * 2 + rectBounds.height;

          if (
            minArea === null ||
            area < minArea ||
            (almostEqual(minArea, area) &&
              (minX === null || shiftVector.translate.x < minX))
          ) {
            minArea = area;
            minWidth = rectBounds.width;
            position = shiftVector;
            minX = shiftVector.translate.x;
          }
        }
      }

      if (position) {
        placed.push(path);
        placements.push(position);
      }
    }

    if (minArea) {
      fitness += minArea / binArea;
    }

    for (i = 0; i < placed.length; ++i) {
      index = paths.indexOf(placed.at(i));

      if (index >= 0) {
        paths.splice(index, 1);
      }
    }

    if (placements && placements.length > 0) {
      allPlacements.push(placements);
    } else {
      break; // something went wrong
    }
  }

  // there were parts that couldn't be placed
  fitness += 2 * paths.length;

  return {
    placements: allPlacements,
    fitness,
    paths,
    area: binArea
  };
}