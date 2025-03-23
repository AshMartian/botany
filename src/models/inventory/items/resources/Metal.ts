import { Resource } from '../../../inventory/Resource';

export class Metal extends Resource {
  constructor(
    quantity = 1,
    id = 'metal',
    name = 'Metal',
    iconPath = '/resources/textures/items/metal.jpg'
  ) {
    super(quantity, id, name, iconPath, true, 5);
  }

  public override getColor(): string {
    return '#808080'; // Metal gray color
  }
}
