/*!
 * SvgNest
 * Licensed under the MIT license
 */

import { GeneticAlgorithm } from "./genetic-algorithm";
import { polygonArea } from "./geometry-util";
import { TreePolygon } from "./polygon";
import { generateNFPCacheKey } from "./util";
import {
  ArrayPolygon,
  NfpPair,
  PairDataResult,
  PlaceDataResult,
  Placement,
  SvgNestConfiguration
} from "./interfaces";
import Phenotype from "./genetic-algorithm/phenotype";
import pairData from "./parallel/shared-worker/pair-data-flow";
import placePaths from "./parallel/shared-worker/place-path-flow";
import { FloatPolygon } from "./geometry-util/float-polygon";


export class AnyNest {
  private _best: PlaceDataResult = null;
  private _isWorking: boolean = false;
  private _genethicAlgorithm: GeneticAlgorithm;
  private _progress: number = 0;
  private _configuration: SvgNestConfiguration;
  private _tree: TreePolygon = null;
  private _binPolygon: FloatPolygon = null;
  private _nfpCache: Map<string, ArrayPolygon[]>;
  private _workerTimer: NodeJS.Timeout = null;

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

  /**
   * Provide the bin shape into which all parts will attempt to be nested.
   * 
   * The bin can be an arbitrary shape. All ArrayPolygons use unspecified units.
   */
  public setBin(bin: FloatPolygon): void {
    // move to align with origin
    this._binPolygon = bin.clone();
    this._binPolygon.translate(this._binPolygon.min.scale(-1));
    this._binPolygon.polygonOffset(-0.5 * this._configuration.spacing, this._configuration.clipperScale, this._configuration.curveTolerance);
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
  public setParts(parts: FloatPolygon[]): void {
    this._tree = new TreePolygon(parts, this._configuration, true);
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

  public getConfig(): SvgNestConfiguration {
    return this._configuration;
  }


  /**
   * Start the nesting algorithm. A genetic algorithm which produces generations of
   * possible packings.
   *
   * @param progressCallback
   *        called periodically as the algorithm runs, approx 10/sec.
   *        progress - progress on the current generation of nestings. [0:1]
   * @param displayCallback(
   *        called at the end of a generation with the best placement that has been identified so far.
   *        placements - a list of list of Placements. If all parts cannot be fit in a single bin
   *                   then a list of Placments will be specified for each bin which is needed in order to
   *                   fit all parts.
   *        utilization - portion of the bin which is used
   * If parts cannot be placed (eg: some part is too big to fit in any bin), then displayCallback will be
   * called with an undefined placements value.
   */
  // TODO:  consider if the no-fit case should be an exception instead.
  start(
    progressCallback: (progress: number) => void,
    displayCallback: (placements: Placement[][], untilization: number) => void
  ): void {
    console.log("start called on anynest");
    if (!this._binPolygon) {
      throw new Error("Missing bin for packing. Ensure you have called setBin");
    }

    if (!this._tree) {
      throw new Error("Missing shapes for nesting. Ensure you have called setParts");
    }

    this._tree.removeDuplicats();
    this._isWorking = false;

    this._workerTimer = setInterval(() => {
      if (!this._isWorking) {
        try {
          this._launchWorkers(displayCallback);
          this._isWorking = true;
        } catch (err) {
          // TODO: should we throw this up to caller? probs.
          console.log(err);
        }
      }

      progressCallback(this._progress);
    }, 100);
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
    for (let i = 0; i < nfpPairs.length; i ++) {

      results.push(pairData(
        nfpPairs[i], {
        rotations: this._configuration.rotations,
        binPolygon: this._binPolygon, // TODO: this is unused.
        searchEdges: this._configuration.exploreConcave,
        useHoles: this._configuration.useHoles
      }
      ));
      this._progress = results.length / nfpPairs.length;
    }

    return results;
  }

  private _launchWorkers(displayCallback: (placements: Placement[][], untilization: number) => void): void {
    let i: number = 0;
    let j: number = 0;

    if (this._genethicAlgorithm.isEmpty) {
      // initiate new GA
      const adam: ArrayPolygon[] = this._tree.polygons;

      // seed with decreasing area
      adam.sort(
        (a: ArrayPolygon, b: ArrayPolygon): number =>
          Math.abs(polygonArea(b.points)) - Math.abs(polygonArea(a.points))
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
    const ids: string[] = [];
    const nfpPairs: NfpPair[] = [];
    const newCache: Map<string, ArrayPolygon[]> = new Map();
    let part: ArrayPolygon;
    let key: string;

    const updateCache = (
      polygon1: ArrayPolygon,
      polygon2: ArrayPolygon,
      rotation1: number,
      rotation2: number,
      inside: boolean
    ) => {
      key = generateNFPCacheKey(
        this._configuration.rotations,
        inside,
        polygon1,
        polygon2,
        rotation1,
        rotation2
      );

      if (!this._nfpCache.has(key)) {
        nfpPairs.push({ A: polygon1, B: polygon2, key });
      } else {
        newCache.set(key, this._nfpCache.get(key));
      }
    };

    for (i = 0; i < placeCount; ++i) {
      part = placeList[i];
      ids.push(part.id);
      part.rotation = rotations[i];

      updateCache(this._binPolygon, part, 0, rotations[i], true);

      for (j = 0; j < i; ++j) {
        updateCache(placeList[j], part, rotations[j], rotations[i], false);
      }
    }

    // only keep cache for one cycle
    this._nfpCache = newCache;

    const placementWorkerData = {
      binPolygon: this._binPolygon,
      paths: placeList.slice(),
      ids,
      rotations,
      config: this._configuration,
      nfpCache: this._nfpCache
    };

    const batchSize: number = 4;
    const results: PairDataResult[] = [];
    const pairResult = this._calculateNfpPairs(4, nfpPairs);


    pairResult.then(
      (generatedNfp: PairDataResult[]) => {
        if (generatedNfp) {
          let i: number = 0;
          let nfp: PairDataResult;

          for (i = 0; i < generatedNfp.length; ++i) {
            nfp = generatedNfp[i];

            if (nfp) {
              // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
              this._nfpCache.set(nfp.key, nfp.value);
            }
          }
        }
        placementWorkerData.nfpCache = this._nfpCache;
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
            let bestPlacement: Placement[];
            const numParts: number = placeList.length;
            const binArea: number = Math.abs(this._binPolygon.area);

            for (i = 0; i < this._best.placements.length; ++i) {
              totalArea += binArea;
              bestPlacement = this._best.placements[i];

              numPlacedParts += bestPlacement.length;

              for (j = 0; j < bestPlacement.length; ++j) {
                if (!bestPlacement[j]) {
                  throw new Error("missing entry in placement: " + JSON.stringify(this._best));
                }
                let part: ArrayPolygon = this._tree.byId(bestPlacement[j].id);
                placedArea += Math.abs(
                  polygonArea(part.points)
                );
              }
            }

            displayCallback(
              this._best.placements,
              placedArea / totalArea
            );
          } else {
            // TODO: spec promises to call displayCallback once per generation...
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
