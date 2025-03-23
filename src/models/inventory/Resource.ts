import { InventoryItem } from './InventoryItem';

export enum ResourceRarity {
  Common = 'Common',
  Uncommon = 'Uncommon',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

export class Resource extends InventoryItem {
  constructor(
    quantity = 1,
    id: string,
    name: string,
    iconPath = '',
    stackable = true,
    maxStackSize = 999, // Resources typically have larger stack sizes
    type = 'resource' // Default type for resources
  ) {
    super(id, name, iconPath, stackable, maxStackSize, quantity, type);
  }

  // Method to get color - can be overridden by subclasses
  public getColor(): string {
    return '#ffffff'; // Default white color
  }

  // Method to get the description - can be overridden by subclasses
  public getDescription(): string {
    return `This is a ${this.name}.`; // Default description
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
