import { InventoryItem } from './InventoryItem';

export class Resource extends InventoryItem {
  constructor(
    id: string,
    name: string,
    iconPath = '',
    stackable = true,
    maxStackSize = 999, // Resources typically have larger stack sizes
    quantity = 1,
    type = 'resource' // Default type for resources
  ) {
    super(id, name, iconPath, stackable, maxStackSize, quantity, type);
  }

  // Method to get color - can be overridden by subclasses
  public getColor(): string {
    return '#ffffff'; // Default white color
  }
}
