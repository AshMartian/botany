import { Resource, InventoryItemDefinition } from '@/models/inventory';

export class Water extends Resource implements InventoryItemDefinition {
  constructor(quantity = 1) {
    super({
      quantity,
      id: 'water',
      name: 'Water',
      iconPath: '/assets/textures/water.png',
      type: 'liquid',
      maxStackSize: 20,
      stackable: true,
      consumable: true,
    });
  }

  public override getColor(): string {
    return '#4287f5'; // Water blue color
  }

  public override getDescription(): string {
    return `A vital resource for survival. AKA H2O`;
  }

  public override getCategory(): string {
    return 'Liquid Resources';
  }
}
