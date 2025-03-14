import { FloatPolygon } from "./geometry-util/float-polygon";

/**
 * 
 */
export interface Shape {
  id: string;
  points: Point[];
}

// TODO: this belongs in interfaces. But we need to split that file into public and internal-only interfaces.
export interface Placement {
  id: string,
  translate: Point,
  rotate: number
}

export interface Point {
  x: number;
  y: number;
  id?: number;
  marked?: boolean;
  rotation?: number;
  start?: Point;
  end?: Point;
  nfp?: any;
  source?: string;
}

export interface GeneticAlgorithmConfig {
  populationSize: number;
  mutationRate: number;
  rotations: number;
}

export interface BoundRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Represents an arbitrary 2D polygon shape. ArrayPolygons don't have any particular unit
 * associated with their points.
 */
export interface ArrayPolygon {
  // Unique identifier for this ArrayPolygon. Name collisions will cause unspecified behavior.
  id: string;

  bounds: BoundRect;

  points: Array<Point>;
  // Back-reference to the parent shape if this is a child.
  parent?: ArrayPolygon;
  // If this ArrayPolygon is representing a shape then it's children represent holes in the parent.
  // Eg: a donut would have a parent ArrayPolygon representing the outer circle and a single child
  // representing the inner circle.
  // Children can themselves have children ArrayPolygons which represent islands within a hole.
  // While such nesting is supported, it's an atypical use case and most usages of this library should
  // have only one level of child ArrayPolygons.
  children?: ArrayPolygon[];
  // Degrees of rotation to be applied to this shape.
  rotation: number;

  area: number;
  // Is this ArrayPolygon a hole or a non-hole? See note about children. Top-level shapes should be
  // hole == false, their children should be hole == true, their children should be hole == false, etc.
  hole?: boolean;
  // IDK what this is (TODO)
  marked?: boolean;
  // TODO: does this ever get used?
  offsetx?: number;
  // TODO: does this ever get used?
  offsety?: number;

  rotate(angle: number): FloatPolygon;
}

export interface NestConfigExternal {
  clipperScale?: number;
  curveTolerance?: number;
  spacing?: number;
  binSpacing?: number;
  rotations?: number;
  populationSize?: number;
  mutationRate?: number;
  useHoles?: boolean;
  exploreConcave?: boolean;
}

export interface NestConfiguration {
  clipperScale: number;
  curveTolerance: number;
  spacing: number;
  binSpacing: number;
  rotations: number;
  populationSize: number;
  mutationRate: number;
  useHoles: boolean;
  exploreConcave: boolean;
}

export interface PairWorkerData {
  rotations: number;
  binPolygon: ArrayPolygon;
  searchEdges: boolean;
  useHoles: boolean;
}

export interface NfpPair {
  A: ArrayPolygon;
  B: ArrayPolygon;
  key: string;
}

export interface PlacePairConfiguration {
  binPolygon: ArrayPolygon;
  paths: ArrayPolygon[];
  ids: string[]; // TODO: why is this even here?
  rotations: number[];
  config: NestConfiguration;
  nfpCache: Map<string, ArrayPolygon[]>;
}

export interface ClipperPoint {
  X: number;
  Y: number;
}

export interface PairDataResult {
  value: ArrayPolygon[];
  key: string;
}

export interface PlaceDataResult {
  placements: Placement[][];
  fitness: number;
  paths: ArrayPolygon[];
  area: number;
}
