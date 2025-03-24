import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/vue';
import { h } from 'vue';
import '@testing-library/jest-dom';
import { createStore } from 'vuex';
import Inventory from '@/views/gui/Inventory.vue';
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

// Mock child components
vi.mock('@/views/gui/Hotbar.vue', () => ({
  default: {
    name: 'Hotbar',
    render() {
      return h('div', { class: 'hotbar-mock', 'data-testid': 'hotbar-component' });
    },
    props: ['inInventory'],
  },
}));

vi.mock('@/views/gui/InventoryItem.vue', () => ({
  default: {
    name: 'InventoryItem',
    render() {
      return h('div', { class: 'inventory-item-mock', 'data-testid': 'inventory-item' });
    },
    props: ['item', 'slotId', 'removable'],
  },
}));

// Mock IndexedDB
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Create a custom renderer function for the inventory component
function renderInventory(customState = {}) {
  // Create a Vuex store with the inventory module
  const store = createStore({
    modules: {
      inventory: {
        ...inventory,
        state:
          typeof inventory.state === 'function'
            ? () => ({
                ...(inventory.state as () => any)(),
                ...customState,
              })
            : inventory.state,
      },
      hotbar: {
        namespaced: true,
        state: () => ({
          activeSlot: 0,
        }),
        getters: {
          getActiveSlot: (state) => state.activeSlot,
        },
        mutations: {
          SET_ACTIVE_SLOT: (state, slot) => {
            state.activeSlot = slot;
          },
        },
      },
    },
  });

  // h is already imported at the top of the file

  return render(Inventory, {
    global: {
      plugins: [store],
      stubs: {
        Hotbar: true,
        InventoryItem: true,
      },
    },
  });
}

describe('Inventory Component', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  test('should not render when inventory is closed', () => {
    const { queryByText } = renderInventory({ isInventoryOpen: false });

    expect(queryByText('Inventory')).not.toBeInTheDocument();
  });

  test('should render when inventory is open', () => {
    const { getByText } = renderInventory({ isInventoryOpen: true });

    expect(getByText('Inventory')).toBeInTheDocument();
  });

  test('should display 27 inventory slots', () => {
    const { getAllByRole } = renderInventory({ isInventoryOpen: true });

    // Inventory slots are represented as divs with class 'inventory-slot'
    // We need to filter because there might be other divs in the component
    const slots = getAllByRole('generic').filter((element) =>
      element.classList.contains('inventory-slot')
    );

    expect(slots.length).toBe(27);
  });

  test('should display an item in the correct slot', async () => {
    const testItem = {
      id: 'test-item',
      name: 'Test Item',
      iconPath: '/test-icon.png',
      quantity: 1,
      stackable: false,
      maxStackSize: 1,
      stackId: generateUUID(),
      position: {
        type: 'inventory',
        index: 0,
      },
    };

    const { getByTestId } = renderInventory({
      isInventoryOpen: true,
      items: [testItem],
    });

    // The InventoryItem component should be rendered inside the first slot
    expect(getByTestId('inventory-item')).toBeInTheDocument();
  });

  test('should close inventory when close button is clicked', async () => {
    const { getByRole, queryByText } = renderInventory({ isInventoryOpen: true });

    const closeButton = getByRole('button');
    await fireEvent.click(closeButton);

    // The inventory should be closed (isInventoryOpen set to false)
    expect(queryByText('Inventory')).not.toBeInTheDocument();
  });

  test('should include the hotbar component', () => {
    const { getByTestId } = renderInventory({ isInventoryOpen: true });

    expect(getByTestId('hotbar-component')).toBeInTheDocument();
  });

  test('should have descriptive instructions', () => {
    const { getByText } = renderInventory({ isInventoryOpen: true });

    expect(getByText('Drag items between inventory slots and hotbar')).toBeInTheDocument();
    expect(getByText('Press 1-9 keys to select hotbar slots')).toBeInTheDocument();
    expect(getByText('Press I or ESC to close inventory')).toBeInTheDocument();
  });
});
