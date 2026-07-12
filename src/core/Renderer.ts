import * as PIXI from 'pixi.js';
import { Engine, Composite, Events } from 'matter-js';

interface Particle {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  alpha: number;
  size: number;
  color: number;
}

export class Renderer {
  private app: PIXI.Application;
  private engine: Engine;
  private graphicsMap: Map<number, PIXI.Graphics>;
  
  // エフェクト管理
  private particleGraphics: PIXI.Graphics;
  private trailParticles: Particle[] = [];
  private sparkParticles: Particle[] = [];

  constructor(app: PIXI.Application, engine: Engine) {
    this.app = app;
    this.engine = engine;
    this.graphicsMap = new Map();

    // エフェクト描画用のGraphicsを作成し、ステージの最前面に追加
    this.particleGraphics = new PIXI.Graphics();
    this.app.stage.addChild(this.particleGraphics);

    // 物理エンジンからの衝突イベントを監視してスパークエフェクトを発生
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (bodyA.label === 'player' || bodyB.label === 'player') {
          // 衝突点の座標を取得
          const contacts = pair.activeContacts || [];
          contacts.forEach((contact: any) => {
            const pos = contact.vertex;
            if (pos) {
              this.createSparks(pos.x, pos.y, 0x6dd5ed); // ネオンブルーの火花
            }
          });
          
          // バンパーに当たったときは黄色い火花を大きく散らす
          if (bodyA.label === 'bumper' || bodyB.label === 'bumper') {
            const bumper = bodyA.label === 'bumper' ? bodyA : bodyB;
            this.createSparks(bumper.position.x, bumper.position.y, 0xf1c40f, 15);
          }
        }
      });
    });
  }

  private createSparks(x: number, y: number, color: number, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1.5;
      this.sparkParticles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        size: Math.random() * 3 + 1.5,
        color: color
      });
    }
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

    // エフェクトと重力インジケーターの更新描画
    this.updateAndRenderEffects(bodies);
  }

  private updateAndRenderEffects(bodies: any[]) {
    this.particleGraphics.clear();

    const player = bodies.find(b => b.label === 'player');
    
    // 1. トレイル（軌跡）パーティクルの追加
    if (player && player.plugin && !player.plugin.isClearing) {
      const speed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
      if (speed > 0.2) {
        this.trailParticles.push({
          x: player.position.x,
          y: player.position.y,
          alpha: 0.5,
          size: player.circleRadius * 0.65,
          color: 0x3498db
        });
      }
    }

    // 2. トレイルの描画と更新
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.alpha -= 0.04;
      p.size -= 0.22;
      if (p.alpha <= 0 || p.size <= 0) {
        this.trailParticles.splice(i, 1);
        continue;
      }
      this.particleGraphics.circle(p.x, p.y, p.size);
      this.particleGraphics.fill({ color: p.color, alpha: p.alpha });
    }

    // 3. スパークの描画と更新
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.x += p.vx!;
      p.y += p.vy!;
      p.alpha -= 0.05;
      p.size *= 0.94;
      if (p.alpha <= 0 || p.size <= 0.3) {
        this.sparkParticles.splice(i, 1);
        continue;
      }
      this.particleGraphics.circle(p.x, p.y, p.size);
      this.particleGraphics.fill({ color: p.color, alpha: p.alpha });
    }
  }

  private createGraphics(body: any) {
    const gfx = new PIXI.Graphics();
    const label = body.label || '';
    gfx.name = label; // ラベルを保存しておく

    // 疑似ネオン（多層描画）でGlowFilterと同等の発光エフェクトを表現（モバイル負荷削減）
    if (label === 'player') {
      // 疑似ネオン外光
      gfx.circle(0, 0, body.circleRadius + 5);
      gfx.fill({ color: 0x3498db, alpha: 0.25 });
      gfx.circle(0, 0, body.circleRadius + 2);
      gfx.fill({ color: 0x3498db, alpha: 0.5 });
      
      // 本体
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0x2980b9 }); // ベースの色
      
      // 立体感を出すためのハイライト
      gfx.circle(-body.circleRadius * 0.3, -body.circleRadius * 0.3, body.circleRadius * 0.4);
      gfx.fill({ color: 0x6dd5ed });
      
    } else if (label === 'wall' || label === 'moving_wall') {
      const w = body.bounds.max.x - body.bounds.min.x;
      const h = body.bounds.max.y - body.bounds.min.y;
      
      // 壁のベース
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill({ color: 0x1e272e }); // 少し暗めの背景色
      // エッジのネオンハイライト
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.stroke({ width: 2, color: 0x5c8a8a });
      
    } else if (label === 'moving_wall_telegraph') {
      const w = body.bounds.max.x - body.bounds.min.x;
      const h = body.bounds.max.y - body.bounds.min.y;
      
      // 疑似ネオン外光（警告）
      gfx.rect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
      gfx.fill({ color: 0xe74c3c, alpha: 0.15 });
      gfx.rect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      gfx.fill({ color: 0xe74c3c, alpha: 0.35 });
      
      // 本体
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill({ color: 0xe74c3c });
      
    } else if (label === 'goal') {
      // 疑似ネオン外光
      gfx.circle(0, 0, body.circleRadius + 10);
      gfx.stroke({ width: 8, color: 0x2ecc71, alpha: 0.2 });
      gfx.circle(0, 0, body.circleRadius + 5);
      gfx.stroke({ width: 4, color: 0x2ecc71, alpha: 0.45 });

      // 穴感（奥が暗い）を表現
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0x111111 }); // 穴の底（暗闇）
      gfx.circle(0, 0, body.circleRadius);
      gfx.stroke({ width: 3, color: 0x2ecc71 }); // 縁のネオン
      
    } else if (label === 'trap' || label === 'moving_trap_telegraph') {
      const isTelegraph = label === 'moving_trap_telegraph';
      const color = isTelegraph ? 0xff0000 : 0x8e44ad;
      const coreColor = isTelegraph ? 0xffaaaa : 0xecf0f1;
      const glowColor = isTelegraph ? 0xff0000 : 0x9b59b6;

      if (body.circleRadius) {
        // 円形トラップ
        gfx.circle(0, 0, body.circleRadius + 8);
        gfx.fill({ color: glowColor, alpha: 0.25 });
        gfx.circle(0, 0, body.circleRadius + 4);
        gfx.fill({ color: glowColor, alpha: 0.45 });

        gfx.circle(0, 0, body.circleRadius);
        gfx.fill({ color: color });
        gfx.circle(0, 0, body.circleRadius);
        gfx.stroke({ width: 2, color: coreColor });
      } else {
        // 矩形トラップ
        const w = body.bounds.max.x - body.bounds.min.x;
        const h = body.bounds.max.y - body.bounds.min.y;
        
        gfx.rect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
        gfx.fill({ color: glowColor, alpha: 0.25 });
        gfx.rect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
        gfx.fill({ color: glowColor, alpha: 0.45 });

        gfx.rect(-w / 2, -h / 2, w, h);
        gfx.fill({ color: color });
        gfx.rect(-w / 2, -h / 2, w, h);
        gfx.stroke({ width: 2, color: coreColor });
      }
      
    } else if (label === 'bumper') {
      // 疑似ネオン外光
      gfx.circle(0, 0, body.circleRadius + 8);
      gfx.fill({ color: 0xf1c40f, alpha: 0.25 });
      gfx.circle(0, 0, body.circleRadius + 4);
      gfx.fill({ color: 0xf1c40f, alpha: 0.5 });

      // 本体
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: 0xf39c12 });
      
      // ハイライト
      gfx.circle(-body.circleRadius * 0.2, -body.circleRadius * 0.2, body.circleRadius * 0.3);
      gfx.fill({ color: 0xffffff, alpha: 0.6 });
    }

    this.app.stage.addChild(gfx);
    this.graphicsMap.set(body.id, gfx);
  }
}
