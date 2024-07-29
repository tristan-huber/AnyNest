import {describe, expect, test} from '@jest/globals';
import {AnyNest} from '../src/any-nest';
import {Shape} from '../src/interfaces';

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

  test('setBin not crash', () => {
    expect(anyNest.setBin({id: 'bin', points: [
        {x: 0, y: 0}, {x: 0, y: 100}, {x: 100, y: 100}, {x: 100, y: 0}]}))
        .toBe(undefined);
  });

  test('a single small part can be positioned within a large bin and its position is provided to the displayCallback function', () => {
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
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ],
    };

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
      expect(displayCallback).toHaveBeenCalledWith(expect.anything()); // Check if displayCallback is called
      expect(displayCallback.mock.calls[0][0].id).toBe('part1'); // Check if the correct part is passed
    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });

  test('two parts which exactly fill the bin can be placed and successfully get a displayCallback', () => {
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
        }, 1000); // Adjust timeout based on the expected duration of the async operation
      } catch (error) {
        reject(error);
      }
    }).then(() => {
      expect(displayCallback).toHaveBeenCalledWith(expect.anything()); // Check if displayCallback is called
      expect(displayCallback.mock.calls[0][0].id).toBe('part2'); // Check if the correct part is passed
    }).finally(() => {
      anyNest.stop();
    });

    return result;
  });
/*
  test('one part which doesn\'t fit within the bin causes start to raise an exception', () => {
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

  test('two parts which each fit within the bin but cannot both fit within the bin causes start to raise an exception', () => {
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
        { x: 5, y: 5 },
        { x: 10, y: 5 },
        { x: 10, y: 10 },
        { x: 5, y: 10 },
      ],
    };

    anyNest.setBin(bin);
    anyNest.setParts([part1, part2]);

    expect(() => anyNest.start(progressCallback, displayCallback)).toThrow();
  });
  */
});