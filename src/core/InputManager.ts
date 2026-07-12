import { Engine } from 'matter-js';

export class InputManager {
  private engine: Engine;
  private maxGravity = 1.0;
  private gyroEnabled = false;

  // ドラッグ操作の状態を公開（Rendererでのインジケーター描画用）
  public isDragging = false;
  public dragStart = { x: 0, y: 0 };
  public dragCurrent = { x: 0, y: 0 };

  constructor(engine: Engine) {
    this.engine = engine;
  }

  public enableGyro() {
    if (this.gyroEnabled) return;
    this.gyroEnabled = true;

    window.addEventListener('deviceorientation', (e) => {
      // ドラッグ操作中はジャイロによる重力更新をスキップして競合を防ぐ
      if (this.isDragging) return;

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

  // ドラッグ操作を有効化する
  public enableDragInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      // canvasのローカル座標系に合わせるためgetBoundingClientRectを使う
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      this.dragStart = { x, y };
      this.dragCurrent = { x, y };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.dragCurrent = { x, y };

      const dx = this.dragCurrent.x - this.dragStart.x;
      const dy = this.dragCurrent.y - this.dragStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 100pxのスライドで最大重力に達する設計
      const dragLimit = 100;
      const strength = Math.min(dist / dragLimit, 1.0) * this.maxGravity;
      
      if (dist > 0) {
        const angle = Math.atan2(dy, dx);
        this.engine.gravity.x = Math.cos(angle) * strength;
        this.engine.gravity.y = Math.sin(angle) * strength;
      } else {
        this.engine.gravity.x = 0;
        this.engine.gravity.y = 0;
      }
    });

    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      
      // 指を離したら重力を0にする (A案)
      this.engine.gravity.x = 0;
      this.engine.gravity.y = 0;
    };

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  // デバッグ用（PC向けキーボード操作）
  public enablePCInput() {
    window.addEventListener('keydown', (e) => {
      // ドラッグ中やキーボード操作が混ざらないよう、キーダウン時は一時的にドラッグ解除
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

