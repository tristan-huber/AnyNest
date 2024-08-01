import { polygonArea } from "../geometry-util";
import FloatPoint from "../geometry-util/float-point";
import {FloatPolygon} from "../geometry-util/float-polygon";
import SharedPolygon from "./shared-polygon";
import { ArrayPolygon, Point, NestConfiguration } from "../interfaces";

export default class TreePolygon extends SharedPolygon {
  private _polygons: FloatPolygon[];

  constructor(
    polygons: FloatPolygon[],
    configuration: NestConfiguration,
    isOffset: boolean
  ) {
    super(configuration);

    this._polygons = polygons;

    if (isOffset) {
      this._offsetTree(this._polygons, this.spacing * 0.5);
    }
  }

  removeDuplicats(): void {
    let start: Point;
    let end: Point;
    let node: FloatPolygon;
    let i: number = 0;
  }

  at(index: number): ArrayPolygon {
    return this._polygons[index];
  }

  byId(id: string): ArrayPolygon {
    let result = this._polygons.filter((poly) => poly.id == id);
    if (result.length == 1) {
      return result[0];
    }
    // TODO: throw?
    return undefined;
  }

  flat(index: number) {
    const part = this._polygons[index];

    return part.children && part.children.length > 0
      ? TreePolygon.flattenTree(part.children, true)
      : null;
  }

  // offset tree recursively
  _offsetTree(tree: FloatPolygon[], offset: number) {
    if (!tree || tree.length == 0) {
      return;
    }
    let i: number = 0;
    let node: FloatPolygon;
    let offsetPaths: ArrayPolygon[];
    const treeSize: number = tree.length;

    for (i = 0; i < treeSize; ++i) {
      node = tree[i];
      if (!node) {
        console.warn("empty node in tree, this is probably bad?");
        continue;
      }
      offsetPaths = this._polygonOffset(node, offset);

      if (offsetPaths.length == 1) {
        //TODO: This is a problem since we need to recompute bounding box and area.
        node.updatePoints(offsetPaths[0].points);
        //var newNode:FloatPolygon = FloatPolygon.clone(offsetPaths[0]);

        // replace array items in place

//        Array.prototype.splice.apply(
 //         node,
  //        [0, node.length].concat(offsetPaths[0])
    //    );
      }

      if (node.children && node.children.length > 0) {
        this._offsetTree(node.children, -offset);
      }
    }
  }

  get polygons() {
    return this._polygons.slice();
  }

  static flattenTree(
    tree: ArrayPolygon[],
    hole: boolean,
    result: ArrayPolygon[] = []
  ): ArrayPolygon[] {
    const nodeCount = tree.length;
    let i = 0;
    let node;
    let children;

    for (i = 0; i < nodeCount; ++i) {
      node = tree[i];
      node.hole = hole;
      children = node.children;

      result.push(node);

      if (children && children.length > 0) {
        TreePolygon.flattenTree(children, !hole, result);
      }
    }

    return result;
  }
}
