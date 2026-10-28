declare module "earcut" {
  /** Triangles (indices into the points) covering a polygon given as flat x,y pairs, holes starting at `holeIndices`. */
  export default function earcut(data: ArrayLike<number>, holeIndices?: ArrayLike<number> | null, dim?: number): number[];
}
