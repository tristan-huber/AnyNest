import { ArrayPolygon } from "./interfaces";

// floating point comparison tolerance
const TOLEARANCE: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

export function almostEqual(
  a: number,
  b: number,
  tolerance: number = TOLEARANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

export function generateNFPCacheKey(
  rotationSplit: number,
  inside: boolean,
  polygon1: ArrayPolygon,
  polygon2: ArrayPolygon,
  rotation1: number = polygon1.rotation,
  rotation2: number = polygon2.rotation
): string {
  const rotationOffset: number = Math.round(360 / rotationSplit);
  const rotationIndex1: number = Math.round(rotation1 / rotationOffset);
  const rotationIndex2: number = Math.round(rotation2 / rotationOffset);

  return JSON.stringify(
    {
      "id1": polygon1.id,
      "id2": polygon2.id,
      "r1": rotation1,
      "r2": rotation2,
      "inside": inside
    }
  )
}

export function keyToNFPData(
  key: string,
  rotationSplit: number
): Float32Array {
  const rotationOffset: number = Math.round(360 / rotationSplit);
  const result = new Float32Array(5);
  let accumulator: number = 0;

  /*
  result[4] = inside;
  result[3] = rotationIndexB * rotationOffset;
  result[2] = rotationIndexA * rotationOffset;
  result[1] = idB - 1;
  result[0] = idA - 1;
*/
  return JSON.parse(key)
 // return result;
}
