import {describe, expect, test} from '@jest/globals';
import {AnyNest} from '../src/any-nest';
import { FloatPolygon } from '../src/geometry-util/float-polygon';
import {Shape, Placement, Point} from '../src/interfaces';

describe('anynest module', () => {
  let anyNest: AnyNest;
  const progressCallback = jest.fn();
  const displayCallback = jest.fn();

  beforeEach(() => {
    anyNest = new AnyNest();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('setBinNoCrash', () => {
    expect(anyNest.setBin(FloatPolygon.fromPoints([
        {x: 0, y: 0}, {x: 0, y: 100}, {x: 100, y: 100}, {x: 100, y: 0}], "bin1")))
        .toBe(undefined);
  });

  test('singlePartFits', () => {
    const bin: FloatPolygon = makeRect("bin1", 10, 10);

    const part: FloatPolygon = makeRect("part1", 2, 2);
    part.translate({x: 1, y: 1});

    anyNest.setBin(bin);
    anyNest.setParts([part]);

    const result = new Promise<boolean>((resolve, reject) => {
      try {
        anyNest.start(progressCallback, displayCallback);
        setTimeout(() => {
          anyNest.stop();
          resolve(true);
        }, 1000); // Adjust timeout based on the expected duration of the async operation
      } catch (error) {
        reject(error);
      }
    }).then(() => {
      // Expect at least one call within 1 second.
      expect(displayCallback.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Our nesting algo involves a randomized first step, so we need to logically
      // interpret the result rather than having a strict expectation.
      displayCallback.mock.calls.map((call) => {
        let placements: Placement[][] = call[0];
        expect(placements).toHaveLength(1); // Should use only one bin
        expect(placements[0]).toHaveLength(1); // Place a single part
        expect(placements[0][0].id).toBe("part1"); // It's the part we provided

        var shifted: Shape = applyPlacement(part, placements);

        // Note this assertion isn't quite robust enough, in theory the
        // order of points could be jumbled in a breaking way, really what we want
        // is to find the 0,0 point then wind the array until that point is at index 0,
        // then make an exact equality assertion.
        expect(shifted.points).toEqual(expect.arrayContaining([{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}]));

        // Utilization in this case is area of shape / area of bin.
        expect(call[1]).toBeCloseTo(2 * 2 / (10 * 10), 4);
      });
    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });

  test('multiPartPartialFill', () => {
    const bin: FloatPolygon = makeRect("bin1", 10, 10);
    const part1: FloatPolygon = makeRect("part1", 5, 10);
    const part2: FloatPolygon = makeRect("part2", 4.8, 9); // TODO: if this is 4.9 it will use 2 bins but shouldn't.

    anyNest.setBin(bin);
    anyNest.setParts([part1, part2]);

    const result = new Promise<boolean>((resolve, reject) => {
      try {
        anyNest.start(progressCallback, displayCallback);
        setTimeout(() => {
          anyNest.stop();
          resolve(true);
        }, 1000); // Adjust timeout based on the expected duration of the async operation
      } catch (error) {
        reject(error);
      }
    }).then(() => {
      expect(displayCallback.mock.calls.length).toBeGreaterThanOrEqual(1);

      let call = displayCallback.mock.calls[displayCallback.mock.calls.length - 1];
      let placements: Placement[][] = call[0];
      expect(placements).toHaveLength(1); // Should use only one bin
      expect(placements[0]).toHaveLength(2);

      expect(placements[0].map((p) => p.id)).toContainEqual("part1");
      expect(placements[0].map((p) => p.id)).toContainEqual("part2");

      expect(call[1]).toBeCloseTo((4.8 * 9 + 5 * 10) / 100, 4);

    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });

  test('useMultipleBinsToFitAllParts', () => {
    const bin: FloatPolygon = makeRect("bin1", 10, 10);
    const part1: FloatPolygon = makeRect("part1", 5, 10);
    const part2: FloatPolygon = makeRect("part2", 5.01, 9);

    anyNest.setBin(bin);
    anyNest.setParts([part1, part2]);

    const result = new Promise<boolean>((resolve, reject) => {
      try {
        anyNest.start(progressCallback, displayCallback);
        setTimeout(() => {
          anyNest.stop();
          resolve(true);
        }, 1000); // Adjust timeout based on the expected duration of the async operation
      } catch (error) {
        reject(error);
      }
    }).then(() => {
      expect(displayCallback.mock.calls.length).toBeGreaterThanOrEqual(1);

      let call = displayCallback.mock.calls[displayCallback.mock.calls.length - 1];
      let placements: Placement[][] = call[0];
      expect(placements).toHaveLength(2); // Outter array of placements is per-bin
    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });

  /**
   * NOTE! Exact fills aren't working right now, see note in place-path-flow
   * That can be updated once we have more robust testing and I understand Clipper better.
   
  test('multiPartExactFill', () => {
    const bin: Shape = {
      id: 'bin1',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    const part1: Shape = {
      id: 'part1',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ],
    };

    const part2: Shape = {
      id: 'part2',
      points: [
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
      ],
    };

    anyNest.setBin(bin);
    anyNest.setParts([part1, part2]);

    const result = new Promise<boolean>((resolve, reject) => {
      try {
        anyNest.start(progressCallback, displayCallback);
        setTimeout(() => {
          anyNest.stop();
          resolve(true);
        }, 2000); // Adjust timeout based on the expected duration of the async operation
      } catch (error) {
        reject(error);
      }
    }).then(() => {
      expect(displayCallback.mock.calls.length).toBeGreaterThanOrEqual(1);

      let call = displayCallback.mock.calls[displayCallback.mock.calls.length - 1];
      let placements: Placement[][] = call[0];
      expect(placements).toHaveLength(1); // Should use only one bin
      expect(placements[0]).toHaveLength(2); // Place a single part

      expect(placements[0].map((p) => p.id)).toContainEqual("part1");
      expect(placements[0].map((p) => p.id)).toContainEqual("part1");

      // 100% utilization
      expect(call[1]).toBeCloseTo(1, 4);

    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });*/

  /*
  test('impossibleFitRaisesException', () => {
    const bin: Shape = {
      id: 'bin1',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    const part: Shape = {
      id: 'part1',
      points: [
        { x: 0, y: 0 },
        { x: 12, y: 0 }, // Extends beyond bin's width
        { x: 12, y: 8 },
        { x: 0, y: 8 },
      ],
    };

    anyNest.setBin(bin);
    anyNest.setParts([part]);

    expect(() => anyNest.start(progressCallback, displayCallback)).toThrow();
  });
  */
});

// Applies the given placement to the given shape. Resulting points are
// rounded to 5 decimal places.
function applyPlacement(shape: Shape, placements: Placement[][]): Shape {
  var filtered = placements.flat().filter((placement) => placement.id == shape.id);
  if (filtered.length != 1) {
    throw new Error("Failed to find placement for shape " + JSON.stringify(shape) + " among placements: " + JSON.stringify(placements));
  }
  const placement = filtered[0];

  const result: Shape = {id: shape.id, points: []};
  const cos: number = Math.cos(placement.rotate * Math.PI / 180);
  const sin: number = Math.sin(placement.rotate * Math.PI / 180);

  // Rotate first then translate.
  shape.points.map((point) => {
    result.points.push({
      x: round((point.x * cos - point.y * sin) + placement.translate.x, 5),
      y: round((point.x * sin + point.y * cos) + placement.translate.y, 5),
  })});
  return result;
}

function round(val: number, decimals: number): number {
  const power = Math.pow(10, decimals);
  var result = Math.round(val * power) / power;
  if (result == -0) {result = 0;}
  return result;
}

function makeRect(id: string, width: number, height: number): FloatPolygon {
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  return FloatPolygon.fromPoints(points, id);
}