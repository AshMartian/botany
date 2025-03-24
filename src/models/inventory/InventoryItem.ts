// Define an interface to use in the constructor method and for serialization

// Define the interface for inventory items
export class InventoryItemDefinition {
  public id: string;
  public name: string;
  public iconPath: string;
  public stackable: boolean;
  public maxStackSize: number;
  public quantity: number;
  public description: string;
  public consumable: boolean;
  constructor(quantity: number) {
    this.id = '';
    this.name = '';
    this.iconPath = '/resources/graphics/textures/items/unknown.jpg';
    this.stackable = false;
    this.maxStackSize = 1;
    this.quantity = Math.max(0, quantity);
    this.description = '';
    this.consumable = false;
  }
}

export interface IInventoryItem {
  id: string;
  name: string;
  iconPath: string;
  quantity: number;
  consumable?: boolean;
  stackable: boolean;
  maxStackSize: number;
  description?: string;
}

export class InventoryItem implements IInventoryItem {
  public id: string;
  public name: string;
  public iconPath = '/resources/graphics/textures/items/unknown.jpg';
  public stackable = false;
  public maxStackSize = 1;
  public quantity = 1;
  public description = '';
  public consumable = false;

  constructor(definition: IInventoryItem) {
    this.id = definition.id;
    this.name = definition.name;
    this.iconPath = definition.iconPath;
    this.stackable = definition.stackable;
    this.maxStackSize = definition.maxStackSize;
    this.quantity = Math.max(0, definition.quantity);
    this.description = definition.description || '';
  }

  /**
   * Default use method - can be overridden by subclasses
   */
  public use(): void {
    console.log(`Using item: ${this.name}`);
    // Base implementation does nothing
    // Subclasses can override this to implement specific behavior
  }

  /**
   * Clone the item
   */
  public clone(): InventoryItem {
    return new InventoryItem({
      id: this.id,
      name: this.name,
      iconPath: this.iconPath,
      stackable: this.stackable,
      maxStackSize: this.maxStackSize,
      quantity: this.quantity,
      description: this.description,
    });
  }

  /**
   * Serialize the item to IInventoryItem
   */
  public serialize(): IInventoryItem {
    return {
      id: this.id,
      name: this.name,
      iconPath: this.iconPath,
      quantity: this.quantity,
      stackable: this.stackable,
      maxStackSize: this.maxStackSize,
      description: this.description,
    };
  }

  /**
   * Add quantity to the item
   * @param amount Amount to add
   * @returns Overflow amount if the item reached its max stack size
   */
  public addQuantity(amount: number): number {
    if (!this.stackable) {
      return amount; // Non-stackable items can't have quantity added
    }

    const newTotal = this.quantity + amount;
    if (newTotal <= this.maxStackSize) {
      this.quantity = newTotal;
      return 0; // No overflow
    } else {
      const overflow = newTotal - this.maxStackSize;
      this.quantity = this.maxStackSize;
      return overflow;
    }
  }

  /**
   * Remove quantity from the item
   * @param amount Amount to remove
   * @returns True if item should be removed from inventory (quantity <= 0)
   */
  public removeQuantity(amount: number): boolean {
    if (!this.stackable) {
      return true; // Non-stackable items are always fully consumed
    }

    this.quantity = Math.max(0, this.quantity - amount);
    return this.quantity <= 0;
  }
}
