import { Resource } from '../../../inventory/Resource';

export class Regolith extends Resource {
  constructor(
    quantity = 1,
    id = 'regolith',
    name = 'Regolith',
    iconPath = '/resources/graphics/textures/items/regolith.jpg'
  ) {
    super(quantity, id, name, iconPath, true, 20);
  }

  public override getColor(): string {
    return '#b37c45'; // Regolith brownish-red color
  }

  public override getDescription(): string {
    return `It is a pile of loose, fragmented material from the Martian surface.`;
  }

  public getResourceType(): string {
    return 'Mineral';
  }
}
