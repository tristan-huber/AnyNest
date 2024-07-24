import {describe, expect, test} from '@jest/globals';
import {AnyNest, Shape} from '../src/any-nest';

describe('anynest module', () => {
  test('setBin not crash', () => {
    let foo = new AnyNest();
    expect(foo.setBin({id: 0, points: [
        {x: 0, y: 0}, {x: 0, y: 100}, {x: 100, y: 100}, {x: 100, y: 0}]}))
        .toBe(undefined);
  });
});