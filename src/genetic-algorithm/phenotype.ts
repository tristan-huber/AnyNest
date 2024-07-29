import { ArrayPolygon } from "../interfaces";

export default class Phenotype {
  private _placement: Array<ArrayPolygon>;
  private _rotation: Array<number>;
  private _fitness: number = 0;

  constructor(placement: Array<ArrayPolygon>, rotation: Array<number>) {
    this._placement = placement;
    this._rotation = rotation;
  }

  public cut(cutPoint: number): Phenotype {
    return new Phenotype(
      this._placement.slice(0, cutPoint),
      this._rotation.slice(0, cutPoint)
    );
  }

  public clone(): Phenotype {
    return new Phenotype(this._placement.slice(), this._rotation.slice());
  }

  public mate(phenotype: Phenotype): void {
    let i = 0;
    let placement = phenotype.placement[0];
    let rotation = phenotype.rotation[0];

    for (i = 0; i < phenotype.size; ++i) {
      placement = phenotype.placement[i];
      rotation = phenotype.rotation[i];

      if (!this._contains(placement.id)) {
        this._placement.push(placement);
        this._rotation.push(rotation);
      }
    }
  }

  private _contains(id: string): boolean {
    let i = 0;
    const size = this.size;

    for (i = 0; i < size; ++i) {
      if (this._placement[i].id === id) {
        return true;
      }
    }

    return false;
  }

  public get placement(): Array<ArrayPolygon> {
    return this._placement;
  }

  public get rotation(): Array<number> {
    return this._rotation;
  }

  public get size(): number {
    return this._placement.length;
  }

  public get fitness(): number {
    return this._fitness;
  }

  public set fitness(value: number) {
    this._fitness = value;
  }
}
