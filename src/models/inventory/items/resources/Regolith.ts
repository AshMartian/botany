import { Resource } from '../../../inventory/Resource';

export class Regolith extends Resource {
  constructor(
    quantity = 1,
    id = 'regolith',
    name = 'Regolith',
    iconPath = '/assets/textures/regolith.png'
  ) {
    super(id, name, iconPath, true, 999, quantity);
  }

  public override getColor(): string {
    return '#b37c45'; // Regolith brownish-red color
  }
}
