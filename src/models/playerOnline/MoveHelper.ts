import { Vector3, Scene, AbstractMesh } from '@babylonjs/core';

/**
 * Patches the BabylonJS moveWithCollisions method to handle invalid terrain meshes
 * This prevents crashes when colliding with terrain chunks that have 0 vertices
 */
export function safetyPatchCollisionSystem(): void {
  // Skip if we're not in a browser environment or BABYLON isn't available
  if (typeof window === 'undefined' || !window.BABYLON) return;

  // Avoid patching multiple times
  if ((window as any).__collisionPatched) return;
  (window as any).__collisionPatched = true;

  if (!window.BABYLON) {
    return;
  }

  // Store original method for reference with type casting
  const originalMoveWithCollisions = (window.BABYLON as any).Mesh.moveWithCollisions;

  // Replace with our safer version
  (window.BABYLON as any).Mesh.moveWithCollisions = function (displacement: any) {
    try {
      // Safety check for scene and meshes
      if (!this.getScene()) return;

      // Find and disable invalid collision meshes temporarily
      const invalidMeshes = this.getScene().meshes.filter(
        (m: any) =>
          m.checkCollisions &&
          (!m.getIndices() ||
            (m.getIndices() && m.getIndices().length === 0) ||
            !m.getVerticesData('position') ||
            (m.getVerticesData('position') && m.getVerticesData('position').length === 0))
      );

      if (invalidMeshes.length > 0) {
        // Temporarily disable collisions on invalid meshes
        invalidMeshes.forEach((mesh: any) => (mesh.checkCollisions = false));

        // Re-enable after collision check
        setTimeout(() => {
          invalidMeshes.forEach((mesh: any) => {
            // Only re-enable if the mesh still exists and has vertices now
            if (
              mesh &&
              !mesh.isDisposed() &&
              mesh.getVerticesData &&
              mesh.getVerticesData('position') &&
              mesh.getVerticesData('position').length > 0
            ) {
              mesh.checkCollisions = true;
            }
          });
        }, 100);
      }

      // Validate the displacement vector
      if (
        !displacement ||
        !isFinite(displacement.x) ||
        !isFinite(displacement.y) ||
        !isFinite(displacement.z)
      ) {
        console.warn('Invalid displacement in moveWithCollisions - using zero');
        displacement = Vector3.Zero();
      }

      // Call original with validated params
      return originalMoveWithCollisions.call(this, displacement);
    } catch (error) {
      console.error('Protected error in moveWithCollisions:', error);

      // Emergency fallback - direct position update
      if (displacement) {
        this.position.addInPlace(displacement);
      }
    }
  };

  console.log('Collision system safely patched');
}
