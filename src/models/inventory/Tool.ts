import { InventoryItem, IInventoryItem } from './InventoryItem';
import { usePlayerStore } from '@/stores/playerStore';
import { Mesh, Scene, SceneLoader, Vector3 } from '@babylonjs/core';

export interface ToolItem extends IInventoryItem {
  modelPath?: string; // Path to the 3D model
  durability?: number; // Tool durability
}

export enum ToolPosition {
  RIGHT_HAND = 'right_hand',
  LEFT_HAND = 'left_hand',
}

export class Tool extends InventoryItem {
  public durability: number;
  public modelPath: string;
  public lastUsed = 0;
  public cooldown = 1000; // Default cooldown in ms
  public isEquipped = false;
  public toolMesh: Mesh | null = null;

  // Store reference to playerStore for tool implementations
  protected playerStore = usePlayerStore();

  constructor(
    props: ToolItem = {
      quantity: 1,
      id: 'tool-unknown',
      name: 'unknown',
      iconPath: '',
      stackable: false,
      maxStackSize: 1,
      modelPath: '',
      durability: 100,
    }
  ) {
    super(props);
    this.durability = props.durability || 100;
    this.modelPath = props.modelPath || '';
  }

  /**
   * Get tool model offset relative to hand position
   * Override in subclass to adjust positioning
   */
  public getOffset(): { position: Vector3; rotation: Vector3 } {
    return {
      position: new Vector3(0, 0, 0),
      rotation: new Vector3(0, 0, 0),
    };
  }

  /**
   * Get the 3D mesh for this tool
   * This loads the model and returns it
   */
  public async getMesh(scene: Scene): Promise<Mesh | null> {
    if (!this.modelPath) {
      console.error(`No model path defined for tool: ${this.id}`);
      return null;
    }

    try {
      const result = await SceneLoader.ImportMeshAsync('', '', this.modelPath, scene);
      if (result.meshes.length > 0) {
        const rootMesh = result.meshes[0] as Mesh;
        rootMesh.name = `tool_${this.id}_${Date.now()}`;

        // Apply tool-specific offset and rotation
        const offset = this.getOffset();
        rootMesh.position = offset.position;
        rootMesh.rotation = offset.rotation;

        return rootMesh;
      }
      return null;
    } catch (error) {
      console.error(`Failed to load tool model from ${this.modelPath}:`, error);
      return null;
    }
  }

  /**
   * Equip this tool to the player
   */
  public async equip(playerId: string, position = ToolPosition.RIGHT_HAND): Promise<boolean> {
    if (!playerId || !globalThis.scene) {
      console.error('Cannot equip tool - invalid player ID or scene');
      return false;
    }

    // Find the hand mesh
    const handMesh = globalThis.scene.getMeshByName(`${position}_${playerId}`);
    if (!handMesh) {
      console.error(`Hand mesh not found for position: ${position}`);
      return false;
    }

    // Load the tool mesh
    this.toolMesh = await this.getMesh(globalThis.scene);
    if (!this.toolMesh) {
      console.error('Failed to load tool mesh');
      return false;
    }

    // Attach the tool mesh to the hand
    this.toolMesh.parent = handMesh;
    this.isEquipped = true;

    // Save to player store that this tool is equipped
    // This will be implemented to ensure only one tool is equipped at a time
    this.playerStore.setEquippedTool(playerId, this.id);

    return true;
  }

  /**
   * Unequip this tool from the player
   */
  public unequip(): boolean {
    if (!this.isEquipped || !this.toolMesh) {
      return false;
    }

    // Dispose of the tool mesh
    this.toolMesh.dispose();
    this.toolMesh = null;
    this.isEquipped = false;
    return true;
  }

  /**
   * Use the tool - this should be overridden by subclasses
   */
  public override use(): void {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastUsed < this.cooldown) {
      console.log(`Tool ${this.name} is on cooldown.`);
      return;
    }

    // Deduct durability
    this.durability -= 1;
    this.lastUsed = now;

    // Handle if durability hits zero
    if (this.durability <= 0) {
      console.log(`${this.name} has broken!`);
      this.unequip();
    }
  }

  /**
   * Repair the tool
   * @param amount Amount of durability to repair
   */
  public repair(amount: number): void {
    this.durability = Math.min(this.durability + amount, 100);
  }

  // Method to get the color - override in subclasses if needed
  public getColor(): string {
    return '#a9a9a9'; // Default tool gray color
  }

  // Method to get the description - can be overridden by subclasses
  public override getDescription(): string {
    return `${this.name} - Durability: ${this.durability}/100`;
  }

  // Method to get the category - can be overridden by subclasses
  public getCategory(): string {
    return 'Tools'; // Default category for tools
  }
}
