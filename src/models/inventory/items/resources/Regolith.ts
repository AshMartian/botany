import { Resource, InventoryItemDefinition, ResourceRarity } from '@/models/inventory';

export class Regolith extends Resource implements InventoryItemDefinition {
  constructor(quantity = 1) {
    super({
      quantity,
      id: 'regolith',
      name: 'Regolith',
      iconPath: '/resources/graphics/textures/items/regolith.jpg',
      stackable: true,
      maxStackSize: 20,
      type: 'mineral',
    });
  }

  public override getColor(): string {
    return '#b37c45'; // Regolith brownish-red color
  }

  public override getDescription(): string {
    return `A pile of loose, fragmented material from the Martian surface.`;
  }

  public getResourceType(): string {
    return 'Mineral';
  }

  public getRarity(): ResourceRarity {
    return ResourceRarity.Common; // Regolith is a common resource
  }
}
