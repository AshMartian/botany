import { Tool, ToolItem, InventoryItemDefinition } from '@/models/inventory';
import { Vector3 } from '@babylonjs/core';

export class Pickaxe extends Tool implements InventoryItemDefinition {
  constructor(quantity = 1) {
    super({
      quantity,
      id: 'pickaxe',
      name: 'Pickaxe',
      iconPath: '/resources/graphics/textures/items/pickaxe.jpg',
      stackable: false,
      maxStackSize: 1,
      modelPath: '/resources/graphics/prefabs/tools/pickaxe.glb',
      durability: 100,
    });

    // Pickaxe specific settings
    this.cooldown = 800; // Faster than default
  }

  /**
   * Override getOffset to position the pickaxe correctly in the player's hand
   */
  public override getOffset(): { position: Vector3; rotation: Vector3 } {
    return {
      position: new Vector3(0, -0.1, 0.1), // Slightly lower and forward
      rotation: new Vector3(Math.PI / 4, 0, 0), // Rotated to look natural in hand
    };
  }

  public override getDescription(): string {
    return `A sturdy pickaxe for mining resources. Durability: ${this.durability}/100`;
  }

  public override getColor(): string {
    return '#4d4d4d'; // Dark gray color for pickaxe
  }

  public override getCategory(): string {
    return 'Mining Tools';
  }

  /**
   * Use the pickaxe - implement mining behavior
   */
  public override use(): void {
    super.use(); // Call base use method for cooldown and durability check

    // If we've returned early from super.use() due to cooldown, don't continue
    if (Date.now() - this.lastUsed > this.cooldown) {
      console.log(`Using pickaxe to mine resources`);

      // Here you would implement resource collection logic
      // For example checking what's in front of the player
      // and adding the appropriate resource to inventory
    }
  }
}
