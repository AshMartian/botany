// src/models/building/BuildObject.ts
import { Vector3 } from '@babylonjs/core'; // Add this import

export interface BuildResourceCost {
  [resourceName: string]: number;
}

export interface IBuildObject {
  id: string;
  name: string;
  description: string;
  resourceCost: BuildResourceCost;
  prefabPath: string;
  placementOffset?: Vector3; // <-- ADDED THIS LINE
  // Add other common properties like previewMeshPath, category, etc. later
}

export class BuildObject implements IBuildObject {
  public id: string;
  public name: string;
  public description: string;
  public resourceCost: BuildResourceCost;
  public prefabPath: string;
  public placementOffset: Vector3; // <-- ADDED THIS LINE

  constructor(
    id: string,
    name: string,
    description: string,
    resourceCost: BuildResourceCost,
    prefabPath: string,
    placementOffset: Vector3 = Vector3.Zero() // <-- ADDED PARAMETER with default
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.resourceCost = resourceCost;
    this.prefabPath = prefabPath;
    this.placementOffset = placementOffset; // <-- ASSIGN THIS PROPERTY
  }
}
