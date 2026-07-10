import { Engine } from 'matter-js';

export class InputManager {
  private engine: Engine;
  private maxGravity = 1.0;
  private gyroEnabled = false;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  public enableGyro() {
    if (this.gyroEnabled) return;
    this.gyroEnabled = true;

    window.addEventListener('deviceorientation', (e) => {
      // 端末が水平(0,0)の時を基準とする
      const beta = e.beta || 0; // x軸回転（前後）: -180 ~ 180
      const gamma = e.gamma || 0; // y軸回転（左右）: -90 ~ 90
      
      // 縦画面（ポートレート）前提
      const gx = Math.max(-this.maxGravity, Math.min(this.maxGravity, gamma / 45));
      const gy = Math.max(-this.maxGravity, Math.min(this.maxGravity, beta / 45));
      
      this.engine.gravity.x = gx;
      this.engine.gravity.y = gy;
    });
  }

  // デバッグ用（PC向けキーボード操作）
  public enablePCInput() {
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp': this.engine.gravity.y = -this.maxGravity; break;
        case 'ArrowDown': this.engine.gravity.y = this.maxGravity; break;
        case 'ArrowLeft': this.engine.gravity.x = -this.maxGravity; break;
        case 'ArrowRight': this.engine.gravity.x = this.maxGravity; break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': this.engine.gravity.y = 0; break;
        case 'ArrowLeft':
        case 'ArrowRight': this.engine.gravity.x = 0; break;
      }
    });
  }
}
