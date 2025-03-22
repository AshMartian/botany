# Code Quality Standards

This document outlines the coding standards and best practices for our project. Following these standards will ensure code consistency, maintainability, and quality across the codebase.

## Project Configuration

Our project uses:

- TypeScript with strict mode enabled
- ESLint for code quality enforcement
- Vue 3 with TypeScript support

### TypeScript Configuration

The project's tsconfig.json has:

- Strict type checking enabled
- Path aliasing configured (`@/` points to `src/`)
- Modern JavaScript target (esnext)
- Full DOM type support

### ESLint Configuration

Our .eslintrc.js extends:

- `plugin:vue/vue3-essential`
- `eslint:recommended`
- `@vue/typescript/recommended`

While the ESLint configuration currently allows `any` types (by disabling `@typescript-eslint/no-explicit-any`), we still recommend avoiding them for better type safety and code quality.

## General Standards

- Write clean, readable, and self-documenting code
- Keep functions small and focused on a single responsibility
- Maintain consistent naming conventions
- Document complex logic with comments
- Write unit tests for critical functionality
- Use meaningful variable and function names
- Limit function parameters (3 or fewer when possible)

## TypeScript Standards

- **Avoid using `any`** - Although allowed by our linting rules, defining proper types or interfaces leads to more robust code

  ```typescript
  // Less desirable
  function process(data: any): any { ... }

  // Better
  interface ProcessData {
    id: string;
    value: number;
  }

  function process(data: ProcessData): ProcessResult { ... }
  ```

- Use TypeScript features like union types, generics, and utility types when appropriate
- Define interfaces for object shapes
- Use type annotations for function parameters and return types
- Take advantage of the strict type checking enabled in tsconfig.json

## Import/Export Standards

- **Use absolute imports from the `@/` path** (configured in tsconfig.json)

  ```typescript
  // Bad
  import { Player } from '../../models/player/Player';

  // Good
  import { Player } from '@/models/player/Player';
  ```

- **Prefer named exports** over default exports

  ```typescript
  // Bad
  export default class Player { ... }

  // Good
  export class Player { ... }
  ```

- **Don't write code in index.ts files** - Use them only for exporting

  ```typescript
  // index.ts - Good
  export * from './Player';
  export * from './Controller';

  // Don't write implementation in index.ts files
  ```

- Group related imports together
- Import only what you need

## Vue.js Best Practices

- Use the Composition API for new components
- Keep components small and focused
- Use props validation
- Emit typed events
- Use Vue's reactivity system appropriately
- Separate component logic from view templates
- Use slots for flexible, reusable components
- Follow the Vue.js style guide priorities A and B

```vue
<script lang="ts">
import { defineComponent, ref, computed } from 'vue';
import { Player } from '@/models/player/Player';

export default defineComponent({
  name: 'PlayerCard',
  props: {
    playerId: {
      type: String,
      required: true,
    },
  },
  setup(props, { emit }) {
    const player = ref<Player | null>(null);
    const isActive = computed(() => player.value?.isActive || false);

    const activatePlayer = () => {
      if (player.value) {
        emit('activate', player.value.id);
      }
    };

    return {
      player,
      isActive,
      activatePlayer,
    };
  },
});
</script>
```

## Babylon.js Best Practices

- Initialize scene objects cleanly and dispose of them properly
- Use typed meshes and avoid type casting when possible
- Leverage the observer pattern for scene events
- Optimize performance using:
  - LOD (Level of Detail)
  - Instance meshes for repeated objects
  - Frustum culling
- Properly dispose of resources to prevent memory leaks
- Use the asset manager for loading resources
- Separate rendering logic from business logic

```typescript
import { Scene, Engine, Vector3, HemisphericLight, MeshBuilder } from '@babylonjs/core';
import { IDisposable } from '@/interfaces/IDisposable';

export class SceneManager implements IDisposable {
  private scene: Scene;
  private engine: Engine;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    this.setupScene();
  }

  private setupScene(): void {
    const light = new HemisphericLight('mainLight', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.7;

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, this.scene);
  }

  public render(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  public dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
```

## State Management

- Use Vuex for global state management
- Structure the store with modules for different domains
- Use strict mode in development
- Define proper types for state, mutations, actions, and getters
- Use getters for derived state
- Keep mutations synchronous and actions asynchronous

```typescript
// store module
import { Module } from 'vuex';
import { RootState } from '@/store/types';
import { Player } from '@/models/player/Player';

export interface PlayerState {
  players: Player[];
  activePlayerId: string | null;
}

export const playerModule: Module<PlayerState, RootState> = {
  namespaced: true,
  state: () => ({
    players: [],
    activePlayerId: null,
  }),
  getters: {
    getActivePlayer: (state) => state.players.find((p) => p.id === state.activePlayerId) || null,
  },
  mutations: {
    SET_PLAYERS(state, players: Player[]) {
      state.players = players;
    },
    SET_ACTIVE_PLAYER(state, playerId: string) {
      state.activePlayerId = playerId;
    },
  },
  actions: {
    async fetchPlayers({ commit }) {
      // Async operations
      const players = await api.getPlayers();
      commit('SET_PLAYERS', players);
    },
  },
};
```

## Linting and Formatting

- Use ESLint with our configured rules from .eslintrc.js
- Run ESLint before committing code
- Configure VS Code to lint and format on save
- Rules to note:
  - Console logs and debuggers are only warned in development
  - Vue deprecated slot attributes are allowed
  - While `any` types are allowed by our linter, we still recommend avoiding them
- Address warnings instead of disabling rules when possible

## Performance Considerations

- Lazy load components and routes
- Avoid unnecessary re-renders in Vue components
- Optimize Babylon.js scenes for performance
- Use proper asset loading strategies
- Implement virtualization for long lists
- Profile your application regularly

## File Structure

- Organize files by feature or domain
- Keep related files close to each other
- Use consistent naming conventions
- Avoid deeply nested directories
- Group components, models, and services logically

```
src/
├── components/       # Vue components
├── models/          # Domain models
│   ├── player/
│   │   ├── Player.ts
│   │   ├── Controller.ts
│   │   └── index.ts  # Only exports, no implementation
│   └── terrain/
├── services/        # API and other services
├── store/          # Vuex store modules
├── utils/          # Utilities and helpers
└── views/          # Route components
```

## Error Handling

- Use try/catch blocks for error-prone code
- Create custom error types for different scenarios
- Log errors appropriately
- Provide user-friendly error messages
- Gracefully degrade functionality when errors occur

## Testing Standards

- Write unit tests for critical logic
- Use integration tests for component interactions
- Create end-to-end tests for critical user flows
- Follow the AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Keep tests independent and isolated
- Jest environment is configured for test files in our ESLint setup

By following these standards, we'll maintain a high-quality, consistent, and maintainable codebase.
