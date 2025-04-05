// src/models/building/objects/Replicator.ts
import { BuildObject, IBuildObject } from '../BuildObject'; // Correct relative path
import { Vector3 } from '@babylonjs/core'; // <-- ADD THIS IMPORT

export class Replicator extends BuildObject implements IBuildObject {
  constructor() {
    super(
      'replicator_01', // Unique ID
      'Replicator', // Name
      'Allows crafting of tools and components.', // Description
      { Iron: 5 }, // Resource Cost - TODO: Use Resource enum/constants later
      '/resources/graphics/prefabs/building/replicator.glb',
      new Vector3(0, 0.7, 0) // <-- ADDED THIS OFFSET ARGUMENT (Adjust Y value as needed)
    );
  }
}
