import { InventoryItem, IInventoryItem } from './InventoryItem';

export enum ResourceRarity {
  Common = 'Common',
  Uncommon = 'Uncommon',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

export interface ResourceItem extends IInventoryItem {
  type?: string; // Type of resource
}

export class Resource extends InventoryItem {
  constructor(
    props: ResourceItem = {
      quantity: 1,
      id: 'resource-unknown',
      name: 'unknown',
      iconPath: '',
      stackable: true,
      maxStackSize: 999,
      type: 'resource',
      consumable: false,
    }
  ) {
    super(props);
  }

  // Method to get color - can be overridden by subclasses
  public getColor(): string {
    return '#ffffff'; // Default white color
  }

  // Method to get the category - can be overridden by subclasses
  public getCategory(): string {
    return 'Resources'; // Default category for resources
  }
  // Method to get the rarity - can be overridden by subclasses
  public getRarity(): ResourceRarity {
    return ResourceRarity.Common; // Default rarity for resources
  }
}
