import * as PIXI from 'pixi.js';
import { Engine, Composite } from 'matter-js';
import { GlowFilter } from 'pixi-filters';

export class Renderer {
  private app: PIXI.Application;
  private engine: Engine;
  private graphicsMap: Map<number, PIXI.Graphics>;

  constructor(app: PIXI.Application, engine: Engine) {
    this.app = app;
    this.engine = engine;
    this.graphicsMap = new Map();
  }

  public render() {
    const bodies = Composite.allBodies(this.engine.world);

    // 同期処理
    for (const body of bodies) {
      if (!this.graphicsMap.has(body.id)) {
        this.createGraphics(body);
      }

      let gfx = this.graphicsMap.get(body.id)!;
      
      // ラベル（状態）が変わった場合は再生成する
      if (gfx.name !== body.label) {
        this.app.stage.removeChild(gfx);
        gfx.destroy();
        this.graphicsMap.delete(body.id);
        this.createGraphics(body);
        gfx = this.graphicsMap.get(body.id)!;
      }

      gfx.position.set(body.position.x, body.position.y);
      gfx.rotation = body.angle;
      
      // ゴール吸い込み時のスケール反映
      if (body.plugin && body.plugin.scale !== undefined) {
        gfx.scale.set(body.plugin.scale);
      } else {
        gfx.scale.set(1);
      }
    }

    // 削除されたBodyのグラフィックをクリーンアップ
    const currentBodyIds = new Set(bodies.map((b) => b.id));
    for (const [id, gfx] of this.graphicsMap) {
      if (!currentBodyIds.has(id)) {
        this.app.stage.removeChild(gfx);
        gfx.destroy();
        this.graphicsMap.delete(id);
      }
    }
  }

  private createGraphics(body: any) {
    const gfx = new PIXI.Graphics();
    const label = body.label || '';
    gfx.name = label; // ラベルを保存しておく

    // スタイリッシュなネオン/カジノ調の描画
    if (label === 'player') {
      // 玉感（立体感）を出すためのハイライト
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0x2980b9 }); // ベースの色
      gfx.circle(-body.circleRadius * 0.3, -body.circleRadius * 0.3, body.circleRadius * 0.4);
      gfx.fill({ color: 0x6dd5ed }); // ハイライト
      gfx.filters = [new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0x3498db })];
      
      // 吸い込まれアニメーション用のスケールを適用できるようpivotはそのまま
    } else if (label === 'wall' || label === 'moving_wall') {
      const w = body.bounds.max.x - body.bounds.min.x;
      const h = body.bounds.max.y - body.bounds.min.y;
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill({ color: 0x34495e });
      gfx.stroke({ width: 2, color: 0x5c8a8a }); // エッジハイライト
    } else if (label === 'moving_wall_telegraph') {
      const w = body.bounds.max.x - body.bounds.min.x;
      const h = body.bounds.max.y - body.bounds.min.y;
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill({ color: 0xe74c3c }); // 赤く発光して警告
      gfx.filters = [new GlowFilter({ distance: 15, outerStrength: 3, color: 0xe74c3c })];
    } else if (label === 'goal') {
      // 穴感（奥が暗い）を表現
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0x111111 }); // 穴の底（暗闇）
      gfx.circle(0, 0, body.circleRadius);
      gfx.stroke({ width: 3, color: 0x2ecc71 }); // 縁のネオン
      gfx.filters = [new GlowFilter({ distance: 15, outerStrength: 3, color: 0x2ecc71 })];
    } else if (label === 'trap') {
      if (body.circleRadius) {
        gfx.circle(0, 0, body.circleRadius);
      } else {
        const w = body.bounds.max.x - body.bounds.min.x;
        const h = body.bounds.max.y - body.bounds.min.y;
        gfx.rect(-w / 2, -h / 2, w, h);
      }
      gfx.fill({ color: 0x8e44ad });
      gfx.stroke({ width: 2, color: 0xecf0f1 });
      gfx.filters = [new GlowFilter({ distance: 12, outerStrength: 2.5, color: 0x9b59b6 })];
    } else if (label === 'bumper') {
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0xf39c12 });
      gfx.filters = [new GlowFilter({ distance: 15, outerStrength: 3, color: 0xf1c40f })];
    }

    this.app.stage.addChild(gfx);
    this.graphicsMap.set(body.id, gfx);
  }
}
