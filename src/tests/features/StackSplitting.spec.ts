import { describe, test, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { MockInstance } from 'vitest';
import { render, fireEvent } from '@testing-library/vue';
import '@testing-library/jest-dom';
import { v4 as generateUUID } from 'uuid';
import { useInventoryStore, InventoryItemWithPosition } from '@/stores/inventoryStore';

// Mock IndexedDB
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Stack Splitting Functionality', () => {
  let inventoryStore: ReturnType<typeof useInventoryStore>;
  const TEST_PLAYER_ID = 'test-player-id';

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    const pinia = createPinia();
    setActivePinia(pinia);

    // Get a fresh instance of the inventory store
    inventoryStore = useInventoryStore();

    // Reset the store state
    inventoryStore.$reset();

    // Spy on store methods to verify they're called correctly
    vi.spyOn(inventoryStore, 'updateItemQuantity');
    vi.spyOn(inventoryStore, 'addSplitStack');
    vi.spyOn(inventoryStore, 'moveItem');
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
        type: 'inventory' as const, // <--- Add 'as const'
        index: 0,
      },
    };

    // Add item to store
    inventoryStore.setItems([stackableItem]);

    // Verify the item was added
    expect(inventoryStore.items.length).toBe(1);
    expect(inventoryStore.items[0].quantity).toBe(10);

    // Split the stack (simulating shift+click)
    await inventoryStore.updateItemQuantity(
      TEST_PLAYER_ID,
      inventoryStore.items[0].stackId,
      5 // Reduce original stack to 5
    );

    await inventoryStore.addSplitStack(
      TEST_PLAYER_ID,
      inventoryStore.items[0],
      5, // New stack gets 5
      {
        type: 'inventory' as const, // <--- Add 'as const'
        index: 1,
      }
    );

    // Verify we now have two stacks
    expect(inventoryStore.items.length).toBe(2);
    expect(inventoryStore.items[0].quantity).toBe(5);
    expect(inventoryStore.items[1].quantity).toBe(5);

    // Verify positions are correct
    expect(inventoryStore.items[0].position.index).toBe(0);
    expect(inventoryStore.items[1].position.index).toBe(1);
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
        type: 'inventory' as const, // <--- Add 'as const'
        index: 0,
      },
    };

    // Add item to store
    inventoryStore.setItems([stackableItem]);

    // Get the original stackId
    const originalStackId = inventoryStore.items[0].stackId;

    // Split the stack (simulating shift+click)
    await inventoryStore.updateItemQuantity(
      TEST_PLAYER_ID,
      originalStackId,
      4 // Original keeps 4
    );

    await inventoryStore.addSplitStack(
      TEST_PLAYER_ID,
      inventoryStore.items[0],
      3, // New stack gets 3 (rounded down from 7/2)
      {
        type: 'inventory' as const, // <--- Add 'as const'
        index: 1,
      }
    );

    // Verify quantities
    expect(inventoryStore.items.length).toBe(2);
    expect(inventoryStore.items[0].quantity).toBe(4);
    expect(inventoryStore.items[1].quantity).toBe(3);
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
        type: 'inventory' as const, // <--- Add 'as const'
        index: 0,
      },
    };

    // Add item to store
    inventoryStore.setItems([stackableItem]);

    // Get the original stackId
    const originalStackId = inventoryStore.items[0].stackId;

    // Split the stack
    await inventoryStore.updateItemQuantity(TEST_PLAYER_ID, originalStackId, 3);

    await inventoryStore.addSplitStack(TEST_PLAYER_ID, inventoryStore.items[0], 3, {
      type: 'inventory' as const, // <--- Add 'as const'
      index: 1,
    });

    // Verify stackIds are different
    expect(inventoryStore.items[0].stackId).toBe(originalStackId);
    expect(inventoryStore.items[1].stackId).not.toBe(originalStackId);
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
        type: 'inventory' as const, // <--- Add 'as const'
        index: 0,
      },
    };

    const stack2 = {
      ...stack1,
      stackId: generateUUID(),
      quantity: 6,
      position: {
        type: 'inventory' as const, // <--- Add 'as const'
        index: 1,
      },
    };

    // Add both stacks to the inventory
    inventoryStore.setItems([stack1, stack2]);

    // Verify we have two stacks
    expect(inventoryStore.items.length).toBe(2);

    // Move stack2 onto stack1 (simulating drag and drop)
    await inventoryStore.moveItem(TEST_PLAYER_ID, stack2.stackId, {
      type: 'inventory' as const, // <--- Add 'as const'
      index: 0,
    });

    // Verify that stack1 is filled to max (10) and remaining quantity (3) is in another position
    const allItems = inventoryStore.items;

    // Find the filled stack (should be at index 0)
    const filledStack = allItems.find(
      (item: InventoryItemWithPosition) => item.position.index === 0
    );

    // Find the remainder stack (should be the other stack)
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
        type: 'inventory' as const, // <--- Add 'as const'
        index: 0,
      },
    };

    // Add item to store
    inventoryStore.setItems([stackableItem]);

    // Get the stackId
    const stackId = inventoryStore.items[0].stackId;

    // Reduce quantity to zero
    await inventoryStore.updateItemQuantity(TEST_PLAYER_ID, stackId, 0);

    // Verify the stack was removed
    expect(inventoryStore.items.length).toBe(0);
  });
});
