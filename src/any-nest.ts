/*!
 * SvgNest
 * Licensed under the MIT license
 */

import { GeneticAlgorithm } from "./genetic-algorithm";
import { polygonArea } from "./geometry-util";
import { TreePolygon, BinPolygon } from "./polygon";
import { generateNFPCacheKey } from "./util";
import {
  ArrayPolygon,
  NfpPair,
  PairDataResult,
  PlaceDataResult,
  Point,
  SvgNestConfiguration
} from "./interfaces";
import Phenotype from "./genetic-algorithm/phenotype";
import pairData from "./parallel/shared-worker/pair-data-flow";
import placePaths from "./parallel/shared-worker/place-path-flow";
import FloatPoint from "./geometry-util/float-point";
import FloatPolygon from "./geometry-util/float-polygon";

interface Shape {
  id: number;
  points: number[][];
}

export default class AnyNest {
  private _best: PlaceDataResult = null;
  private _isWorking: boolean = false;
  private _genethicAlgorithm: GeneticAlgorithm;
  private _progress: number = 0;
  private _configuration: SvgNestConfiguration;
  private _tree: TreePolygon = null;
  private _binPolygon: BinPolygon = null;
  private _nfpCache: Map<number, ArrayPolygon[]>;
  private _workerTimer: number = null;

  constructor() {
    // keep a reference to any style nodes, to maintain color/fill info
    this._nfpCache = new Map();
    this._configuration = {
      clipperScale: 10000000,
      curveTolerance: 0.3,
      spacing: 0,
      rotations: 4,
      populationSize: 10,
      mutationRate: 10,
      useHoles: false,
      exploreConcave: false
    };
    this._genethicAlgorithm = new GeneticAlgorithm();
  }

  private _shapeToPolygon(shape: Shape): ArrayPolygon {
    const points: FloatPoint[] = [];
    for (var i = 0; i < shape.points.length; i++) {
      points.push(new FloatPoint(shape.points[i][0], shape.points[i][1]));
    }
    return FloatPolygon.fromPoints(points, shape.id);
  }

  /**
   * Provide the bin shape into which all parts will attempt to be nested.
   * 
   * The bin can be an arbitrary shape. All ArrayPolygons use unspecified units.
   */
  public setBin(bin: Shape): void {
    this._binPolygon = new BinPolygon(
      this._shapeToPolygon(bin),
      this._configuration
    );
  }

  /**
   * Provide the list of parts which will attempt to be packed into the bin.
   * 
   * Note: ArrayPolyon has a 'children' element which can be used to represent holes within a given part.
   * In general children are holes, their children are islands, etc.
   * Children elements should not appear at top-level members of the given parts array.
   * 
   * The given parts list should not include the bin polygon.
   */
  public setParts(parts: Shape[]): void {
    const polygons: ArrayPolygon[] = [];
    for (var i = 0; i < parts.length; i++) {
      polygons.push(this._shapeToPolygon(parts[i]));
    }
    this._tree = new TreePolygon(polygons, this._configuration, true);
  }

  /**
   * Provide the configuration for this nesting algorithm. See interfaces.ts for full details on the configuration
   * object. But some important values to consider are:
   *   - spacing: the additinal buffer to leave around each shape when nesting. Same arbitrary units as ArrayPolygon's points
   *   - rotations: this library will attempt to rotate shapes to find a better nesting, but will rotate shapes only by
   *                360 / configuration.rotations degree increments.
   *                higher values here incur substantial increases in runtime but may yeild better nestings
   *   -  useHoles: place pieces in holes of other parts if they fit. Default false
   * See https://github.com/Jack000/SVGnest?tab=readme-ov-file#configuration-parameters for additional information.
   *
   * @param configuration to override some, none, or all of the default config values.
   * @returns a copy of the configuration which will be used, including defaults for any configurations which were
   *     unspecified in the input.
   */
  public config(configuration: {
    [key: string]: string;
  }): SvgNestConfiguration {
    if (!configuration) {
      return this._configuration;
    }

    if ("spacing" in configuration) {
      this._configuration.spacing = parseFloat(configuration.spacing);
    }

    if (configuration.rotations && parseInt(configuration.rotations) > 0) {
      this._configuration.rotations = parseInt(configuration.rotations);
    }

    if (
      configuration.populationSize &&
      parseInt(configuration.populationSize) > 2
    ) {
      this._configuration.populationSize = parseInt(
        configuration.populationSize
      );
    }

    if (
      configuration.mutationRate &&
      parseInt(configuration.mutationRate) > 0
    ) {
      this._configuration.mutationRate = parseInt(configuration.mutationRate);
    }

    if ("useHoles" in configuration) {
      this._configuration.useHoles = !!configuration.useHoles;
    }

    if ("exploreConcave" in configuration) {
      this._configuration.exploreConcave = !!configuration.exploreConcave;
    }

    this._best = null;
    this._nfpCache.clear();
    this._genethicAlgorithm.clear();

    return this._configuration;
  }


  /**
   * Start the nesting algorithm. A genetic algorithm which produces generations of
   * possible packings.
   * 
   * @param generations - number of generations to run the genetic algorithm.
   * @param progressCallback(progress: number) - progress on this generation of nestings. [0:1]
   *        called periodically as the algorithm runs, approx 10/sec.
   * @param displayCallback(placements: Point[][], utilization: number, numPartsPlaced: number, numParts: number)
   *        called at the end of a generation if a new and better placement has been identified.
   *        placements - a list of offsets and rotations to be applied to each part.
   *        utilization - portion of the bin which is used
   * // TODO: utilization needs to be more clearly defined. Eg: are the tiny spaces between shapes counted as utilized?
   * // they're definitely waste. Or is this just a measure of how much width is used?
   *        numPartsPlaced - the number of parts which were successfully placed
   *        numParts - Total parts which were attempted to be placed (TODO: why do we have this? the caller should already know..)
   * @returns false if this algorithm failed to start (eg: setBin or setParts have not been called)
   */
  start(generations: number, progressCallback: Function, displayCallback: Function): boolean {
    console.log("start called on anynest");
    if (!this._binPolygon || !this._tree) {
      return false;
    }

    if (!this._binPolygon.isValid) {
      return false;
    }

    this._tree.removeDuplicats();
    this._isWorking = false;

    this._workerTimer = setInterval(() => {
      if (!this._isWorking) {
        try {
          this._launchWorkers(displayCallback);
          this._isWorking = true;
        } catch(err) {
          console.log(err);
        }
      }

      progressCallback(this._progress);
    }, 100);

    return true;
  }

  /**
   * Stop the nesting algorithm.
   */
  public stop(): void {
    this._isWorking = false;

    if (this._workerTimer) {
      clearInterval(this._workerTimer);
      this._workerTimer = null;
    }
  }

  private async _calculateNfpPairs(batchSize: number, nfpPairs: NfpPair[]): Promise<PairDataResult[]> {
    const results: PairDataResult[] = [];

    // TODO: As written we wait for the slowest pairData call in each batch. This could
    // theoretically be made faster by having a single shared queue between batchSize
    // persistant workers. That would require a more complex implementation that what's
    // here.
    for (let i = 0; i < nfpPairs.length; i += batchSize) {

      results.push(pairData(
        nfpPairs[0], {
              rotations: this._configuration.rotations,
              binPolygon: this._binPolygon.polygons,
              searchEdges: this._configuration.exploreConcave,
              useHoles: this._configuration.useHoles
            }
        ));
      console.log("pushed another nfpPair");
      this._progress = results.length / nfpPairs.length;
    }

    return results;
  }

  private _launchWorkers(displayCallback: Function): void {
    console.log("_launchWorkers called");
    let i: number = 0;
    let j: number = 0;

    if (this._genethicAlgorithm.isEmpty) {
      // initiate new GA
      const adam: ArrayPolygon[] = this._tree.polygons;

      // seed with decreasing area
      adam.sort(
        (a: ArrayPolygon, b: ArrayPolygon): number =>
          Math.abs(polygonArea(b)) - Math.abs(polygonArea(a))
      );

      this._genethicAlgorithm.init(
        adam,
        this._binPolygon.bounds,
        this._configuration
      );
    }

    const individual: Phenotype = this._genethicAlgorithm.individual;
    const placeList: ArrayPolygon[] = individual.placement;
    const rotations: number[] = individual.rotation;
    const placeCount: number = placeList.length;
    const ids: number[] = [];
    const nfpPairs: NfpPair[] = [];
    const newCache: Map<number, ArrayPolygon[]> = new Map();
    let part: ArrayPolygon;
    let numKey: number = 0;

    const updateCache = (
      polygon1: ArrayPolygon,
      polygon2: ArrayPolygon,
      rotation1: number,
      rotation2: number,
      inside: boolean
    ) => {
      numKey = generateNFPCacheKey(
        this._configuration.rotations,
        inside,
        polygon1,
        polygon2,
        rotation1,
        rotation2
      );

      if (!this._nfpCache.has(numKey)) {
        nfpPairs.push({ A: polygon1, B: polygon2, numKey });
      } else {
        newCache.set(numKey, this._nfpCache.get(numKey));
      }
    };

    for (i = 0; i < placeCount; ++i) {
      part = placeList[i];
      ids.push(part.id);
      part.rotation = rotations[i];

      updateCache(this._binPolygon.polygons, part, 0, rotations[i], true);

      for (j = 0; j < i; ++j) {
        updateCache(placeList[j], part, rotations[j], rotations[i], false);
      }
    }

    // only keep cache for one cycle
    this._nfpCache = newCache;

    const placementWorkerData = {
      binPolygon: this._binPolygon.polygons,
      paths: placeList.slice(),
      ids,
      rotations,
      config: this._configuration,
      nfpCache: this._nfpCache
    };

    const batchSize: number = 4;
    const results: PairDataResult[] = [];
    const pairResult = this._calculateNfpPairs(4, nfpPairs);

    console.log("pair result promise established");

    pairResult.then(
      (generatedNfp: PairDataResult[]) => {
        console.log("handling pair results" + generatedNfp);
        if (generatedNfp) {
          let i: number = 0;
          let nfp: PairDataResult;

          for (i = 0; i < generatedNfp.length; ++i) {
            nfp = generatedNfp[i];

            if (nfp) {
              // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
              this._nfpCache.set(nfp.numKey, nfp.value);
            }
          }
        }

        placementWorkerData.nfpCache = this._nfpCache;


        console.log("placing paths");
        return [placePaths(placeList.slice(), placementWorkerData)];
      })
     .then(
          (placements: PlaceDataResult[]) => {
            if (!placements || placements.length == 0) {
              return;
            }

            let i: number = 0;
            let j: number = 0;
            let bestResult = placements[0];

            individual.fitness = bestResult.fitness;

            for (i = 1; i < placements.length; ++i) {
              if (placements[i].fitness < bestResult.fitness) {
                bestResult = placements[i];
              }
            }

            if (!this._best || bestResult.fitness < this._best.fitness) {
              this._best = bestResult;

              let placedArea: number = 0;
              let totalArea: number = 0;
              let numPlacedParts: number = 0;
              let bestPlacement: Point[];
              const numParts: number = placeList.length;
              const binArea: number = Math.abs(this._binPolygon.area);

              for (i = 0; i < this._best.placements.length; ++i) {
                totalArea += binArea;
                bestPlacement = this._best.placements[i];

                numPlacedParts += bestPlacement.length;

                for (j = 0; j < bestPlacement.length; ++j) {
                  placedArea += Math.abs(
                    polygonArea(this._tree.at(bestPlacement[j].id))
                  );
                }
              }

              displayCallback(
                this._best.placements,
                placedArea / totalArea,
                numPlacedParts,
                numParts
              );
            } else {
              displayCallback();
            }
            this._isWorking = false;
          },
          function (err) {
            console.log(err);
          }
        )
     .catch((err) => {
       console.log(err);
     });
     // TODO: should we return this future chain as well?
  }
}
