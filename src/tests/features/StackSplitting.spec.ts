import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, fireEvent } from '@testing-library/vue';
import { Store } from 'vuex';
import { InventoryState, InventoryItemWithPosition } from '@/store/vuex/inventory';

interface StoreState {
  inventory: InventoryState;
  hotbar?: { activeSlot: number };
}
import '@testing-library/jest-dom';
import { createStore } from 'vuex';
import { inventory } from '@/store/vuex/inventory';
import { v4 as generateUUID } from 'uuid';

// Mock dependencies
vi.mock('@/store/store', () => ({
  default: {
    getSelfPlayerId: () => 'test-player-id',
    getPlayer: () => ({ inventory: [] }),
    notifySubscribers: vi.fn(),
    refreshInventory: vi.fn(),
  },
}));

vi.mock('@/services/PlayerInventory', () => ({
  playerInventory: {
    syncWithStore: vi.fn(),
  },
}));

// Mock IndexedDB
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Stack Splitting Functionality', () => {
  let store: Store<StoreState>;
  let dispatchSpy: MockInstance;

  beforeEach(() => {
    // Set up a fresh store for each test
    store = createStore({
      modules: {
        inventory: {
          ...inventory,
          state: () => ({
            items: [],
            isInventoryOpen: false,
          }),
        },
      },
    }) as unknown as Store<StoreState>;

    // Spy on dispatch to verify it's called with correct arguments
    dispatchSpy = vi.spyOn(store, 'dispatch');
  });

  test('splitting a stack creates two stacks with the correct quantities', async () => {
    // Add a stackable item to the inventory
    const stackableItem = {
      id: 'test-resource',
      name: 'Test Resource',
      iconPath: '/test.png',
      quantity: 10,
      stackable: true,
      maxStackSize: 20,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    // Add item to store
    await store.commit('inventory/ADD_ITEM', stackableItem);

    // Verify the item was added
    expect(store.state.inventory.items.length).toBe(1);
    expect(store.state.inventory.items[0].quantity).toBe(10);

    // Split the stack (simulating shift+click)
    await store.dispatch('inventory/updateItemQuantity', {
      stackId: store.state.inventory.items[0].stackId,
      quantity: 5, // Reduce original stack to 5
    });

    await store.dispatch('inventory/addSplitStack', {
      originalItem: store.state.inventory.items[0],
      quantity: 5, // New stack gets 5
      position: {
        type: 'inventory',
        index: 1,
      },
    });

    // Verify we now have two stacks
    expect(store.state.inventory.items.length).toBe(2);
    expect(store.state.inventory.items[0].quantity).toBe(5);
    expect(store.state.inventory.items[1].quantity).toBe(5);

    // Verify positions are correct
    expect(store.state.inventory.items[0].position.index).toBe(0);
    expect(store.state.inventory.items[1].position.index).toBe(1);
  });

  test('splitting an odd-numbered stack rounds down for the new stack', async () => {
    // Add a stackable item with odd quantity
    const stackableItem = {
      id: 'test-resource',
      name: 'Test Resource',
      iconPath: '/test.png',
      quantity: 7,
      stackable: true,
      maxStackSize: 20,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    // Add item to store
    await store.commit('inventory/ADD_ITEM', stackableItem);

    // Get the original stackId
    const originalStackId = store.state.inventory.items[0].stackId;

    // Split the stack (simulating shift+click)
    await store.dispatch('inventory/updateItemQuantity', {
      stackId: originalStackId,
      quantity: 4, // Original keeps 4
    });

    await store.dispatch('inventory/addSplitStack', {
      originalItem: store.state.inventory.items[0],
      quantity: 3, // New stack gets 3 (rounded down from 7/2)
      position: {
        type: 'inventory',
        index: 1,
      },
    });

    // Verify quantities
    expect(store.state.inventory.items.length).toBe(2);
    expect(store.state.inventory.items[0].quantity).toBe(4);
    expect(store.state.inventory.items[1].quantity).toBe(3);
  });

  test('splitting generates a unique stackId for the new stack', async () => {
    // Add a stackable item
    const stackableItem = {
      id: 'test-resource',
      name: 'Test Resource',
      iconPath: '/test.png',
      quantity: 6,
      stackable: true,
      maxStackSize: 20,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    // Add item to store
    await store.commit('inventory/ADD_ITEM', stackableItem);

    // Get the original stackId
    const originalStackId = store.state.inventory.items[0].stackId;

    // Split the stack
    await store.dispatch('inventory/updateItemQuantity', {
      stackId: originalStackId,
      quantity: 3,
    });

    await store.dispatch('inventory/addSplitStack', {
      originalItem: store.state.inventory.items[0],
      quantity: 3,
      position: {
        type: 'inventory',
        index: 1,
      },
    });

    // Verify stackIds are different
    expect(store.state.inventory.items[0].stackId).toBe(originalStackId);
    expect(store.state.inventory.items[1].stackId).not.toBe(originalStackId);
  });

  test('combining stacks respects maxStackSize', async () => {
    // Create two stacks
    const stack1 = {
      id: 'test-resource',
      name: 'Test Resource',
      iconPath: '/test.png',
      quantity: 7,
      stackable: true,
      maxStackSize: 10,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    const stack2 = {
      ...stack1,
      stackId: generateUUID(),
      quantity: 6,
      position: {
        type: 'inventory',
        index: 1,
      },
    };

    // Add both stacks to the inventory
    await store.commit('inventory/ADD_ITEM', stack1);
    await store.commit('inventory/SET_ITEMS', [store.state.inventory.items[0], stack2]);

    // Verify we have two stacks
    expect(store.state.inventory.items.length).toBe(2);

    // Move stack2 onto stack1 (simulating drag and drop)
    await store.dispatch('inventory/moveItem', {
      stackId: stack2.stackId,
      newPosition: {
        type: 'inventory',
        index: 0,
      },
    });

    // Verify that stack1 is filled to max (10) and remaining quantity (3) is in stack2
    const allItems = store.state.inventory.items;
    const filledStack = allItems.find(
      (item: InventoryItemWithPosition) => item.position.index === 0
    );
    const remainderStack = allItems.find(
      (item: InventoryItemWithPosition) => item.stackId !== filledStack?.stackId
    );

    if (!filledStack || !remainderStack) {
      throw new Error('Expected stacks not found');
    }

    expect(filledStack.quantity).toBe(10);
    expect(remainderStack.quantity).toBe(3);
  });

  test('stack with zero quantity is removed', async () => {
    // Add a stackable item
    const stackableItem = {
      id: 'test-resource',
      name: 'Test Resource',
      iconPath: '/test.png',
      quantity: 2,
      stackable: true,
      maxStackSize: 20,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    // Add item to store
    await store.commit('inventory/ADD_ITEM', stackableItem);

    // Get the stackId
    const stackId = store.state.inventory.items[0].stackId;

    // Reduce quantity to zero
    await store.dispatch('inventory/updateItemQuantity', {
      stackId,
      quantity: 0,
    });

    // Verify the stack was removed
    expect(store.state.inventory.items.length).toBe(0);
  });
});
