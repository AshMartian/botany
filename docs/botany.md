# Botany

We are building a Mars Terraforming game where the player role plays a botanist who's mission is to plant and grow life on the read planet (Mars).

# Mechanics

# Repo Map

src/
├── App.vue
├── assets
│   ├── fonts
│   │   ├── Play-Bold.ttf
│   └── images
│   ├── UX assets go here
├── global.d.ts
├── main.ts
├── models
│   ├── Animation.ts
│   ├── Game.ts
│   ├── Helpers.ts
│   ├── mehanics
│   │   ├── Collisions.ts
│   │   ├── Doors.ts
│   │   ├── JumpPad.ts
│   │   ├── Points.ts
│   │   ├── Savepoint.ts
│   │   └── Teleport.ts
│   ├── player
│   │   ├── Controller.ts
│   │   ├── MoveHelper.ts
│   │   ├── Move.ts
│   │   ├── PlayerSpawner.ts
│   │   ├── Player.ts
│   │   └── SharedPlayerState.ts
│   ├── playerSelf
│   │   ├── Camera.ts
│   │   ├── ControllerJoystick.ts
│   │   ├── ControllerKeyboard.ts
│   │   ├── Controller.ts
│   │   ├── Move.ts
│   │   ├── Player.ts
│   │   └── Rotation.ts
│   ├── Players.ts
│   ├── scene
│   │   ├── BlendModes.ts
│   │   ├── Canvas.ts
│   │   ├── ContainerManager.ts
│   │   ├── DevMode.ts
│   │   ├── Environment.ts
│   │   ├── LightPoints.ts
│   │   ├── LODs.ts
│   │   ├── Materials.ts
│   │   ├── Optimize.ts
│   │   ├── OutLiner.ts
│   │   ├── Prefabs.ts
│   │   ├── Scene.ts
│   │   ├── Sky.ts
│   │   └── TagsExtansion.ts
│   ├── ServerClient.ts
│   ├── sounds
│   │   ├── Audio.ts
│   │   ├── Background.ts
│   │   ├── Door.ts
│   │   ├── Music.ts
│   │   ├── Player.ts
│   │   ├── SoundMain.ts
│   │   └── Tube.ts
│   ├── storage
│   │   ├── Level.ts
│   │   └── Settings.ts
│   ├── terrain
│   │   ├── GlobalMap.ts
│   │   ├── MiniMap.ts
│   │   ├── TerrainChunk.ts
│   │   ├── TerrainManager.ts
│   │   ├── TerrainMaterial.ts
│   │   └── WorldManager.ts
│   └── сommon
│   ├── Body.ts
│   ├── character
│   │   ├── animation_groups
│   │   │   ├── AnimationGroupInterface.ts
│   │   │   ├── Idle.ts
│   │   │   ├── JumpFinish.ts
│   │   │   ├── JumpMiddle.ts
│   │   │   ├── JumpStart.ts
│   │   │   ├── Run.ts
│   │   │   ├── Sprint.ts
│   │   │   └── Walk.ts
│   │   ├── Animation.ts
│   │   ├── Character.ts
│   │   └── Rotation.ts
│   ├── Jump.ts
│   ├── Move.ts
│   ├── rayCast
│   │   ├── RayCastFootFour.ts
│   │   ├── RayCastFootOne.ts
│   │   ├── RayCastFootThree.ts
│   │   ├── RayCastFoot.ts
│   │   ├── RayCastFootTwo.ts
│   │   ├── RayCastHead.ts
│   │   └── RayCastMesh.ts
│   └── Rotation.ts
├── shims-vue.d.ts
├── store
│   ├── store.ts
│   ├── types.ts
│   └── vuex
│   ├── index.ts
│   ├── level
│   │   ├── index.ts
│   │   ├── mutations.ts
│   │   └── types.ts
│   ├── settingsLevel
│   │   ├── index.ts
│   │   ├── mutations.ts
│   │   └── types.ts
│   └── types.ts
├── styles
│   ├── app.sass
│   ├── finish_page.sass
│   ├── levels_page.sass
│   ├── main_page.sass
│   ├── play_with_friends_page.sass
│   └── suiet.sass
├── views
│   ├── FinishPage.vue
│   ├── gui
│   │   ├── MenuLevel.vue
│   │   ├── MobileJoystick.vue
│   │   ├── Settings.vue
│   │   └── topbar
│   │   ├── BottomBar.vue
│   │   ├── MapButton.vue
│   │   └── TopBar.vue
│   ├── LevelPage.vue
│   ├── LevelPreview.vue
│   ├── LevelsPage.vue
│   ├── MainPage.vue
│   ├── PlayWithFiendsPage.vue
│   └── SettingsPage.vue
└── vuex.d.ts

24 directories, 118 files
