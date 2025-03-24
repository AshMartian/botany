import { Resource, InventoryItemDefinition } from '@/models/inventory';

export class Silicon extends Resource implements InventoryItemDefinition {
  constructor(quantity = 1) {
    super({
      quantity,
      id: 'silicon',
      name: 'Silicon',
      iconPath: '/assets/textures/silicon.png',
      stackable: true,
      maxStackSize: 999,
      type: 'mineral',
    });
  }

  public override getColor(): string {
    return '#8a8a8a'; // Silicon color (slightly different shade of gray)
  }

  public override getDescription(): string {
    return `A crucial component in technology and manufacturing.`;
  }

  public getResourceType(): string {
    return 'Mineral';
  }
}
