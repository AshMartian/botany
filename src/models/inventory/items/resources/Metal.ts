import { Resource } from '../../../inventory/Resource';

export class Metal extends Resource {
  constructor(quantity = 1, id = 'metal', name = 'Metal', iconPath = '/assets/textures/metal.png') {
    super(id, name, iconPath, true, 999, quantity);
  }

  public override getColor(): string {
    return '#808080'; // Metal gray color
  }
}
