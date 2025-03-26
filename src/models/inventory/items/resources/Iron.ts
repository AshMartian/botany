import { Resource, InventoryItemDefinition } from '@/models/inventory';

export class Iron extends Resource implements InventoryItemDefinition {
  constructor(quantity = 1) {
    super({
      quantity,
      id: 'iron',
      name: 'Iron',
      iconPath: '/resources/graphics/textures/items/iron.jpg',
      stackable: true,
      maxStackSize: 5,
      type: 'metal',
    });
  }

  public override getColor(): string {
    return '#808080'; // Metal gray color
  }

  public override getDescription(): string {
    return `A fundamental material used in various applications.`;
  }
}
