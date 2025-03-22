// Define the interface for inventory items
export interface IInventoryItem {
  id: string;
  name: string;
  iconPath: string;
  quantity: number;
  stackable: boolean;
  maxStackSize: number;
  use?: () => void;
  description?: string;
}

export class InventoryItem implements IInventoryItem {
  constructor(
    public id: string,
    public name: string,
    public iconPath: string = '/assets/textures/default-item.png',
    public stackable: boolean = false,
    public maxStackSize: number = 1,
    public quantity: number = 1,
    public description: string = ''
  ) {}

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
    return new InventoryItem(
      this.id,
      this.name,
      this.iconPath,
      this.stackable,
      this.maxStackSize,
      this.quantity,
      this.description
    );
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
