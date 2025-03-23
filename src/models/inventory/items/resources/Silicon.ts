import { Resource } from '../../../inventory/Resource';

export class Silicon extends Resource {
  constructor(
    quantity = 1,
    id = 'silicon',
    name = 'Silicon',
    iconPath = '/assets/textures/silicon.png'
  ) {
    super(quantity, id, name, iconPath, true, 999);
  }

  public override getColor(): string {
    return '#8a8a8a'; // Silicon color (slightly different shade of gray)
  }
}
