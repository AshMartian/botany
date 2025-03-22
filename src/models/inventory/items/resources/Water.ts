import { Resource } from '../../../inventory/Resource';

export class Water extends Resource {
  constructor(quantity = 1, id = 'water', name = 'Water', iconPath = '/assets/textures/water.png') {
    super(id, name, iconPath, true, 999, quantity);
  }

  public override getColor(): string {
    return '#4287f5'; // Water blue color
  }
}
