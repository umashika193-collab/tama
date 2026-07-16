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
  private warpRings: { x: number; y: number; radius: number; maxRadius: number; alpha: number; color: number }[] = [];

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
    const player = bodies.find(b => b.label === 'player');

    // 1. ワープやアイテム獲得のトリガー検知とエフェクト登録
    if (player && player.plugin) {
      if (player.plugin.justWarped) {
        const warpData = player.plugin.justWarped;
        this.triggerWarpEffects(warpData.fromX, warpData.fromY, warpData.toX, warpData.toY);
        player.plugin.justWarped = null;
      }
      if (player.plugin.justCollectedItem) {
        const itemData = player.plugin.justCollectedItem;
        this.triggerItemCollectEffects(itemData.x, itemData.y, itemData.type);
        player.plugin.justCollectedItem = null;
      }
    }

    // 2. 同期処理
    for (const body of bodies) {
      if (!this.graphicsMap.has(body.id)) {
        this.createGraphics(body);
      }

      let gfx = this.graphicsMap.get(body.id)!;
      
      // ボディの種類や状態を組み合わせた一意の名前を決定
      let stateName = body.label;
      if (body.label === 'player') {
        stateName = `player_${body.plugin?.state || 'normal'}`;
      } else if (body.label === 'item_metal' || body.label === 'item_rubber') {
        stateName = `${body.label}_${body.plugin?.active ? 'active' : 'inactive'}`;
      }

      // 状態名（またはラベル）が変わった場合は再生成する
      if (gfx.name !== stateName) {
        this.app.stage.removeChild(gfx);
        gfx.destroy();
        this.graphicsMap.delete(body.id);
        this.createGraphics(body);
        gfx = this.graphicsMap.get(body.id)!;
        gfx.name = stateName;
      }

      gfx.position.set(body.position.x, body.position.y);
      gfx.rotation = body.angle;
      
      // ポータルの回転（ポータルはゆっくり自転させる）
      if (body.label === 'portal') {
        // ポータルの元々の角度に累積回転を加える
        body.angle += 0.015;
      }

      // ゴール吸い込み時のスケール反映
      if (body.plugin && body.plugin.scale !== undefined) {
        gfx.scale.set(body.plugin.scale);
      } else {
        gfx.scale.set(1);
      }
    }

    // 3. 削除されたBodyのグラフィックをクリーンアップ
    const currentBodyIds = new Set(bodies.map((b) => b.id));
    for (const [id, gfx] of this.graphicsMap) {
      if (!currentBodyIds.has(id)) {
        this.app.stage.removeChild(gfx);
        gfx.destroy();
        this.graphicsMap.delete(id);
      }
    }

    // 4. エフェクトと重力インジケーターの更新描画
    this.updateAndRenderEffects(bodies);
  }


  private updateAndRenderEffects(bodies: any[]) {
    this.particleGraphics.clear();

    const player = bodies.find(b => b.label === 'player');
    
    // 1. トレイル（軌跡）パーティクルの追加
    if (player && player.plugin && !player.plugin.isClearing) {
      const speed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
      if (speed > 0.2) {
        let color = 0x3498db; // 通常はネオンブルー
        let trailSize = player.circleRadius * 0.65;
        let trailAlpha = 0.5;

        // ボール状態によるトレイル変化
        if (player.plugin.state === 'metal') {
          color = 0x95a5a6; // メタルシルバー
          trailSize = player.circleRadius * 0.45;
          trailAlpha = 0.4;
        }

        this.trailParticles.push({
          x: player.position.x,
          y: player.position.y,
          alpha: trailAlpha,
          size: trailSize,
          color: color
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

    // 4. ワープリングエフェクトの描画と更新
    for (let i = this.warpRings.length - 1; i >= 0; i--) {
      const r = this.warpRings[i];
      r.radius += (r.maxRadius - r.radius) * 0.15; // イージングで高速展開
      r.alpha -= 0.05;
      if (r.alpha <= 0 || r.radius >= r.maxRadius - 1) {
        this.warpRings.splice(i, 1);
        continue;
      }
      this.particleGraphics.circle(r.x, r.y, r.radius);
      this.particleGraphics.stroke({ width: 3.5, color: r.color, alpha: r.alpha });
      
      // 二重リングでよりサイバー感を演出
      this.particleGraphics.circle(r.x, r.y, r.radius * 0.7);
      this.particleGraphics.stroke({ width: 1.5, color: r.color, alpha: r.alpha * 0.7 });
    }
  }

  private triggerWarpEffects(fromX: number, fromY: number, toX: number, toY: number) {
    // ワープ元
    this.warpRings.push({
      x: fromX,
      y: fromY,
      radius: 5,
      maxRadius: 60,
      alpha: 1.0,
      color: 0x3498db
    });

    // ワープ先
    this.warpRings.push({
      x: toX,
      y: toY,
      radius: 5,
      maxRadius: 60,
      alpha: 1.0,
      color: 0xe67e22
    });

    this.createSparks(fromX, fromY, 0x3498db, 10);
    this.createSparks(toX, toY, 0xe67e22, 10);
  }

  private triggerItemCollectEffects(x: number, y: number, type: 'metal') {
    const color = 0xbdc3c7;
    this.warpRings.push({
      x: x,
      y: y,
      radius: 5,
      maxRadius: 80,
      alpha: 1.0,
      color: color
    });
    this.createSparks(x, y, color, 22);
  }

  private createGraphics(body: any) {
    const gfx = new PIXI.Graphics();
    const label = body.label || '';
    gfx.name = label; // ラベルを保存しておく

    // 疑似ネオン（多層描画）でGlowFilterと同等の発光エフェクトを表現（モバイル負荷削減）
    if (label === 'player') {
      const state = body.plugin?.state || 'normal';
      let glowColor = 0x3498db; // デフォルト：青
      let baseColor = 0x2980b9;
      let highlightColor = 0x6dd5ed;

      if (state === 'metal') {
        glowColor = 0x95a5a6; // メタルシルバー
        baseColor = 0x7f8c8d;
        highlightColor = 0xecf0f1;
      }

      // 疑似ネオン外光
      gfx.circle(0, 0, body.circleRadius + 5);
      gfx.fill({ color: glowColor, alpha: 0.25 });
      gfx.circle(0, 0, body.circleRadius + 2);
      gfx.fill({ color: glowColor, alpha: 0.5 });
      
      // 本体
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: baseColor }); // ベースの色
      
      // 立体感を出すためのハイライト
      gfx.circle(-body.circleRadius * 0.3, -body.circleRadius * 0.3, body.circleRadius * 0.4);
      gfx.fill({ color: highlightColor });

      if (state === 'metal') {
        // メタル特有のインナーサークルを描画し、より金属感を出す
        gfx.circle(0, 0, body.circleRadius - 3);
        gfx.stroke({ width: 1.5, color: 0x333333, alpha: 0.6 });
      }
      
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

    } else if (label === 'switch' || label === 'switch_activated') {
      const isAct = label === 'switch_activated';
      const glow = isAct ? 0x2ecc71 : 0x8e44ad;
      
      // スイッチの外光
      gfx.circle(0, 0, body.circleRadius + 6);
      gfx.fill({ color: glow, alpha: 0.2 });
      gfx.circle(0, 0, body.circleRadius + 2);
      gfx.fill({ color: glow, alpha: 0.4 });
      
      // 本体
      gfx.circle(0, 0, body.circleRadius);
      gfx.fill({ color: isAct ? 0x27ae60 : 0x6c5ce7 });
      
      // 内側のマーク（スイッチON/OFFを示す円）
      gfx.circle(0, 0, body.circleRadius * 0.5);
      gfx.stroke({ width: 2, color: isAct ? 0xa9dfbf : 0xecf0f1 });
      
    } else if (label === 'gate') {
      const w = body.bounds.max.x - body.bounds.min.x;
      const h = body.bounds.max.y - body.bounds.min.y;
      
      // ゲート（半透明電磁ゲート）
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill({ color: 0x1abc9c, alpha: 0.15 });
      
      // 枠線のネオン
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.stroke({ width: 3, color: 0x1abc9c });
      
      // 電磁波風の斜め模様
      const spacing = 15;
      for (let x = -w/2; x < w/2; x += spacing) {
        gfx.moveTo(x, -h/2);
        gfx.lineTo(x + h, h/2);
      }
      gfx.stroke({ width: 1, color: 0x1abc9c, alpha: 0.4 });
      
    } else if (label === 'portal') {
      const portalId = body.plugin?.portalId || 'A';
      const isA = portalId.endsWith('A');
      const glow = isA ? 0x3498db : 0xe67e22; // Aは青、Bはオレンジ
      const r = body.circleRadius || 25;
      
      // ネオン外光
      gfx.circle(0, 0, r + 8);
      gfx.stroke({ width: 4, color: glow, alpha: 0.15 });
      gfx.circle(0, 0, r + 3);
      gfx.stroke({ width: 2, color: glow, alpha: 0.45 });
      
      // 中心コア
      gfx.circle(0, 0, r);
      gfx.fill({ color: 0x111111 });
      
      // 渦巻きブレードを描画
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        gfx.moveTo(0, 0);
        gfx.arc(0, 0, r, angle, angle + 0.6);
        gfx.stroke({ width: 2.5, color: glow });
      }
      
    } else if (label.startsWith('item_metal')) {
      const isActive = body.plugin?.active;

      if (!isActive) {
        // 獲得済みは非表示
        gfx.alpha = 0;
      } else {
        gfx.alpha = 1;
        const color = 0xbdc3c7;
        const glow = 0x7f8c8d;
        const r = body.circleRadius || 18;
        
        // ダイヤ型外光
        gfx.moveTo(0, -r - 4);
        gfx.lineTo(r + 4, 0);
        gfx.lineTo(0, r + 4);
        gfx.lineTo(-r - 4, 0);
        gfx.closePath();
        gfx.fill({ color: glow, alpha: 0.3 });
        
        // 本体（ひし形）
        gfx.moveTo(0, -r);
        gfx.lineTo(r, 0);
        gfx.lineTo(0, r);
        gfx.lineTo(-r, 0);
        gfx.closePath();
        gfx.fill({ color: 0x34495e });
        gfx.stroke({ width: 2.5, color: color });
        
        // コア
        gfx.circle(0, 0, r * 0.45);
        gfx.fill({ color: 0xecf0f1 });
      }
    }

    this.app.stage.addChild(gfx);
    this.graphicsMap.set(body.id, gfx);
  }
}

