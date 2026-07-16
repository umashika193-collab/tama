export const GAME_CONFIG = {
  bumperSpeed: 12,
  stage10WindmillSpeed: 0.04,
  stage10WindmillWidthRatio: 0.8,
  
  // Ball states physics config
  ballNormal: {
    restitution: 0.5,
    friction: 0.01,
    density: 0.001 // Base matter-js density is around 0.001
  },
  ballMetal: {
    restitution: 0.05,
    friction: 0.1,
    density: 0.004, // 4 times heavier
    duration: 360  // 6 seconds at 60fps
  },
  
  // Portal & Gimmick cooldowns
  portalCooldown: 60, // frames to prevent immediate re-teleportation
  itemRespawnTime: 240 // frames until item reappears after collection
};

