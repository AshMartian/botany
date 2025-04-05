// src/stores/playerStore.ts
import { defineStore } from 'pinia';
import { Color3 } from '@babylonjs/core';
import { isEqual } from 'lodash';
import { useInventoryStore } from './inventoryStore';
import { IInventoryItem } from '@/models/inventory/InventoryItem';

export interface SyncData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  characterAngle: number;
}

export interface Forward {
  left: boolean;
  right: boolean;
  front: boolean;
  back: boolean;
  isMoving: boolean;
  sprint: boolean;
}

// Player movement state
interface PlayerMoveState {
  forward: Forward;
  jump: boolean;
  isFlying: boolean;
  isFlyingEnd: boolean;
  jumpStart: boolean;
  jumpRunning: boolean;
  rotate: { x: number; y: number };
  syncData: SyncData;
  speed: number;
  speedType: string;
  speedGravity: number;
}

// Player data
export interface Player {
  id: string;
  move: PlayerMoveState;
  character: string;
  skinColor: Color3;
  points: number;
  equippedToolId?: string; // New field to track equipped tool
}

// Game settings
interface GameSettings {
  gravityMin: number;
  gravityMax: number;
  speed: number;
  speedSprint: number;
  speedDeltaTimeDivider: number;
  jumpHeight: number;
  jumpHeightSprint: number;
  acceleration: number;
  accelerationGravity: number;
  transitionAnimationSpeed: number;
}

export type PlayerSubscriptionFunction = (type: string, data: unknown) => void;

// Store state
export interface PlayerState {
  selfPlayerId: string | undefined;
  selfPlayer: Player | undefined;
  players: Player[];
  globalPosition?: { x: number; z: number };
  settings: GameSettings;
  interactions: {
    text: string;
    key: string;
    priority: number;
  }[];
  subscribers: { [key: string]: PlayerSubscriptionFunction[] };
}

// Default player template
const defaultPlayerTemplate: Player = {
  id: 'new',
  character: 'SpaceGirl.glb',
  skinColor: Color3.Random(),
  points: 0,
  equippedToolId: undefined, // No tool equipped by default
  move: {
    forward: {
      front: false,
      back: false,
      left: false,
      right: false,
      isMoving: false,
      sprint: false,
    },
    rotate: { x: 0, y: 0 },
    jump: false,
    isFlying: true,
    isFlyingEnd: false,
    jumpStart: false,
    jumpRunning: false,
    speed: 0,
    speedType: 'Idle',
    speedGravity: 0,
    syncData: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0 },
      characterAngle: 0,
    },
  },
};

// Define the Pinia store
export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => ({
    selfPlayerId: undefined,
    selfPlayer: undefined,
    players: [],
    globalPosition: undefined,
    interactions: [],
    settings: {
      speed: 0.06,
      speedSprint: 0.09,
      speedDeltaTimeDivider: 500,
      acceleration: 0.004,
      gravityMin: 0.009,
      gravityMax: 0.3,
      accelerationGravity: 0.0033,
      jumpHeight: 3.3,
      jumpHeightSprint: 4.2,
      transitionAnimationSpeed: 0.08,
    },
    subscribers: {},
  }),

  getters: {
    // Get the current player
    currentPlayer: (state) => state.selfPlayer,

    // Get player ID
    currentPlayerId: (state) => state.selfPlayerId,

    // Get all players
    allPlayers: (state) => state.players,

    // Get game settings
    gameSettings: (state) => state.settings,

    // Get player interaction
    playerInteraction: (state) => state.interactions,

    // Get equipped tool ID for a player
    getEquippedToolId: (state) => (playerId: string) => {
      const player = state.players.find((player) => player.id === playerId);
      return player?.equippedToolId;
    },
  },

  actions: {
    // Set the current player ID
    setPlayerId(playerId: string) {
      this.selfPlayerId = playerId;
    },

    // Get a player by ID
    getPlayer(playerId: string): Player | undefined {
      return this.players.find((player) => player.id === playerId);
    },

    // Add a new player
    addPlayer(playerId: string, skinColor: Color3) {
      const playerCheck = this.players.find((player) => player.id === playerId);

      if (playerCheck === undefined) {
        const newPlayer = JSON.parse(JSON.stringify(defaultPlayerTemplate));
        newPlayer.id = playerId;
        newPlayer.skinColor = skinColor;

        this.players.push(newPlayer);

        if (playerId === this.selfPlayerId) {
          this.selfPlayer = newPlayer;
        }
      }
    },

    // Set player movement state
    setForward(playerId: string, forward: Forward) {
      forward.isMoving = !(!forward.left && !forward.right && !forward.back && !forward.front);

      const player = this.getPlayer(playerId);
      if (player) {
        const oldForward = player.move.forward;
        const equal = isEqual(oldForward, forward);

        if (!equal) {
          player.move.forward = { ...forward };
          this.notifySubscribers(playerId, 'forward', forward);
        }
      }
    },

    // Set player rotation
    setRotate(playerId: string, x: number, y: number) {
      const player = this.getPlayer(playerId);
      if (player) {
        if (player.move.rotate.x !== x || player.move.rotate.y !== y) {
          player.move.rotate.x = x;
          player.move.rotate.y = y;
        }
        this.notifySubscribers(playerId, 'rotate', { x, y });
      }
    },

    // Set player jump state
    setJump(playerId: string, jump: boolean) {
      const player = this.getPlayer(playerId);
      if (player && player.move.jump !== jump) {
        player.move.jump = jump;
        this.notifySubscribers(playerId, 'jump', jump);
      }
    },

    // Trigger jump start
    setJumpStart(playerId: string) {
      const player = this.getPlayer(playerId);
      if (player) {
        player.move.jumpStart = true;
        this.notifySubscribers(playerId, 'jumpStart', true);

        setTimeout(() => {
          if (player) {
            player.move.jumpStart = false;
            this.notifySubscribers(playerId, 'jumpStart', false);
          }
        }, 200);
      }
    },

    // Set jump running state
    setJumpRunning(playerId: string, isRun: boolean) {
      const player = this.getPlayer(playerId);
      if (player) {
        player.move.jumpRunning = isRun;
        this.notifySubscribers(playerId, 'jumpRunning', isRun);
      }
    },

    // Set flying state
    setIsFlying(playerId: string, isFlying: boolean) {
      const player = this.getPlayer(playerId);
      if (player && player.move.isFlying !== isFlying) {
        player.move.isFlying = isFlying;
        this.notifySubscribers(playerId, 'isFlying', isFlying);
      }
    },

    // Set speed type
    setSpeedType(playerId: string, type: string) {
      const player = this.getPlayer(playerId);
      if (player && player.move.speedType !== type) {
        player.move.speedType = type;
        this.notifySubscribers(playerId, 'speedType', type);
      }
    },

    // Set speed
    setSpeed(playerId: string, speed: number) {
      const player = this.getPlayer(playerId);
      if (player && player.move.speed !== speed) {
        player.move.speed = speed;
        this.notifySubscribers(playerId, 'speed', speed);
      }
    },

    // Set sprint state
    setSprint(playerId: string, sprint: boolean) {
      const player = this.getPlayer(playerId);
      if (player) {
        const oldSprint = player.move.forward.sprint;
        const equal = oldSprint === sprint;

        if (!equal) {
          player.move.forward.sprint = sprint;
          this.notifySubscribers(playerId, 'sprint', sprint);
        }
      }
    },

    // Set gravity speed
    setSpeedGravity(playerId: string, speed: number) {
      const player = this.getPlayer(playerId);
      if (player && player.move.speedGravity !== speed) {
        player.move.speedGravity = speed;
      }
    },

    // Set sync data
    setSyncData(playerId: string, data: SyncData) {
      const player = this.getPlayer(playerId);
      if (player) {
        const equal = isEqual(player.move.syncData, data);
        if (!equal) {
          player.move.syncData = data;
        }
      }
    },

    setInteraction(text: string, key: string, priority = 0) {
      // Find if we already have an interaction with the same key
      const existingIndex = this.interactions.findIndex((interaction) => interaction.key === key);

      if (existingIndex >= 0) {
        // Update existing interaction with same key
        this.interactions[existingIndex] = { text, key, priority };
      } else {
        // Add new interaction
        this.interactions.push({ text, key, priority });
      }

      // Sort interactions by priority (higher numbers first)
      this.interactions.sort((a, b) => b.priority - a.priority);
    },

    clearInteractions() {
      this.interactions = [];
    },

    removeInteraction(key: string) {
      this.interactions = this.interactions.filter((interaction) => interaction.key !== key);
    },

    // Add points to a player
    addPoints(playerId: string, count: number) {
      const player = this.getPlayer(playerId);
      if (player) {
        player.points += count;
        this.setSprint(playerId, true);
      }
    },

    // Remove points from a player
    removePoints(playerId: string, count: number) {
      const player = this.getPlayer(playerId);
      if (player) {
        player.points -= count;
        if (player.points <= 0) {
          this.setSprint(playerId, false);
        }
      }
    },

    // Set player global position
    setPlayerGlobalPosition(position: { x: number; z: number }): void {
      // Validate position data before processing
      if (isNaN(position.x) || isNaN(position.z)) {
        console.error('Invalid position data:', position);
        return;
      }

      // Ensure position is normalized between 0-1
      const normalizedPosition = {
        x: Math.max(0, Math.min(1, position.x)),
        z: Math.max(0, Math.min(1, position.z)),
      };

      // Only update if position has changed significantly (reduces storage writes)
      const hasChanged =
        !this.globalPosition ||
        Math.abs(this.globalPosition.x - normalizedPosition.x) > 0.001 ||
        Math.abs(this.globalPosition.z - normalizedPosition.z) > 0.001;

      if (hasChanged) {
        this.globalPosition = normalizedPosition;

        // Save to localStorage with timestamp
        const saveData = {
          position: normalizedPosition,
          timestamp: Date.now(),
        };

        try {
          localStorage.setItem('playerGlobalPosition', JSON.stringify(saveData));
        } catch (e) {
          console.warn('Failed to save player position to localStorage:', e);
        }
      }
    },

    // Get player global position
    getPlayerGlobalPosition(): { x: number; z: number } | undefined {
      // Try to load from localStorage if not in state
      if (!this.globalPosition) {
        const saved = localStorage.getItem('playerGlobalPosition');
        if (saved) {
          try {
            const saveData = JSON.parse(saved);
            // Handle both new format with timestamp and old format
            this.globalPosition = saveData.position || saveData;

            // Add null check before accessing properties
            if (!this.globalPosition) {
              console.warn('Invalid saved position format');
              return undefined;
            }

            // Validate coordinates are in 0-1 range
            if (
              this.globalPosition.x < 0 ||
              this.globalPosition.x > 1 ||
              this.globalPosition.z < 0 ||
              this.globalPosition.z > 1
            ) {
              console.warn('Invalid saved position, using defaults');
              this.globalPosition = { x: 0.5, z: 0.5 };
            }
          } catch (e) {
            console.warn('Failed to parse saved position', e);
          }
        }
      }
      return this.globalPosition;
    },

    // Tool management methods

    /**
     * Set the equipped tool for a player
     * @param playerId The ID of the player
     * @param toolId The ID of the tool to equip
     */
    setEquippedTool(playerId: string, toolId: string | undefined) {
      const player = this.getPlayer(playerId);
      if (player) {
        // Only update if different
        if (player.equippedToolId !== toolId) {
          player.equippedToolId = toolId;
          this.notifySubscribers(playerId, 'equippedTool', toolId);
        }
      }
    },

    /**
     * Unequip the current tool from a player
     * @param playerId The ID of the player
     */
    unequipTool(playerId: string) {
      this.setEquippedTool(playerId, undefined);
    },

    /**
     * Use the currently equipped tool
     * @param playerId The ID of the player
     */
    useEquippedTool(playerId: string) {
      const player = this.getPlayer(playerId);
      const toolId = player?.equippedToolId;

      if (toolId) {
        const inventoryStore = useInventoryStore();
        // Find the tool in inventory
        const items = inventoryStore.allItems;
        const toolStack = items.find((item) => item.id === toolId);

        if (toolStack) {
          inventoryStore.useItem(playerId, toolStack.stackId);
        }
      }
    },

    // Inventory integration methods

    /**
     * Give an item to a player
     * @param playerId The ID of the player
     * @param item The item to give
     * @param quantity Optional quantity
     */
    async giveItemToPlayer(
      playerId: string,
      item: IInventoryItem,
      quantity?: number
    ): Promise<void> {
      const inventoryStore = useInventoryStore();
      await inventoryStore.addItem(playerId, quantity ? { ...item, quantity } : item);
    },

    /**
     * Remove an item from a player's inventory
     * @param playerId The ID of the player
     * @param stackId The ID of the item stack
     */
    async removeItemFromPlayer(playerId: string, stackId: string): Promise<void> {
      const inventoryStore = useInventoryStore();
      await inventoryStore.removeItem(playerId, stackId);
    },

    /**
     * Use an item from the inventory
     * @param playerId The ID of the player
     * @param stackId The stack ID of the item
     */
    async usePlayerItem(playerId: string, stackId: string): Promise<void> {
      const inventoryStore = useInventoryStore();
      await inventoryStore.useItem(playerId, stackId);
    },

    subscribe(playerId: string, callback: any) {
      if (!this.subscribers[playerId]) {
        this.subscribers[playerId] = [];
      }

      this.subscribers[playerId].push(callback);
    },

    notifySubscribers(playerId: string, type: string, data: any = null) {
      if (this.subscribers[playerId]) {
        for (const callback of this.subscribers[playerId]) {
          callback(type, data);
        }
      }
    },
  },
});
