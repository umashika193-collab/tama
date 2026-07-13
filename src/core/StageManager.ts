import { Engine, World, Bodies, Body, Composite, Events } from 'matter-js';
import { GAME_CONFIG } from './Config';

export class StageManager {
  private engine: Engine;
  private currentStage = 1;

  // callbacks
  public onClear: () => void = () => {};
  public onMiss: () => void = () => {};
  public onStageChange: (stage: number) => void = () => {};

  constructor(engine: Engine) {
    this.engine = engine;
    
    Events.on(this.engine, 'collisionStart', (e) => {
      e.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const labelA = bodyA.label;
        const labelB = bodyB.label;

        if (labelA === 'player' || labelB === 'player') {
          const otherLabel = labelA === 'player' ? labelB : labelA;
          const playerBody = labelA === 'player' ? bodyA : bodyB;
          const otherBody = labelA === 'player' ? bodyB : bodyA;

          if (playerBody.plugin && playerBody.plugin.isClearing) return;

          if (otherLabel === 'goal') {
            playerBody.plugin = playerBody.plugin || {};
            playerBody.plugin.isClearing = true;
            playerBody.plugin.goalRef = otherBody;
            this.handleClear();
          } else if (otherLabel === 'trap') {
            this.handleMiss();
          } else if (otherLabel === 'bumper') {
            // バンパーの反発力を手動で強制的に与える（跳ねない問題の解消）
            const dx = playerBody.position.x - otherBody.position.x;
            const dy = playerBody.position.y - otherBody.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const speed = GAME_CONFIG.bumperSpeed; // リアルタイムチューナーの値を使用
            Body.setVelocity(playerBody, {
              x: (dx / dist) * speed,
              y: (dy / dist) * speed
            });
          } else if (otherLabel === 'switch') {
            // スイッチギミック
            const plugin = otherBody.plugin;
            if (plugin && !plugin.activated) {
              plugin.activated = true;
              otherBody.label = 'switch_activated'; // 見た目変更用のラベル更新
              
              // 対応するゲートを見つけて削除する
              const gateId = plugin.gateId;
              const allBodies = Composite.allBodies(this.engine.world);
              const targetGate = allBodies.find(b => b.label === 'gate' && b.plugin && b.plugin.gateId === gateId);
              if (targetGate) {
                Composite.remove(this.engine.world, targetGate);
                // ゲートが消滅したことをプレイヤーのプラグインに通知（Rendererで消滅演出を行うため）
                playerBody.plugin = playerBody.plugin || {};
                playerBody.plugin.justOpenedGate = gateId;
              }
            }
          } else if (otherLabel === 'portal') {
            // ポータルワープギミック
            const now = Date.now();
            const portalPlugin = otherBody.plugin;
            if (portalPlugin && (!portalPlugin.lastWarpTime || now - portalPlugin.lastWarpTime > 1000)) {
              const partnerId = portalPlugin.partnerId;
              const allBodies = Composite.allBodies(this.engine.world);
              const partnerPortal = allBodies.find(b => b.label === 'portal' && b.plugin && b.plugin.portalId === partnerId);
              
              if (partnerPortal) {
                // ワープ位置の決定
                Body.setPosition(playerBody, { x: partnerPortal.position.x, y: partnerPortal.position.y });
                
                // 両方のポータルにクールダウンを設定
                portalPlugin.lastWarpTime = now;
                partnerPortal.plugin = partnerPortal.plugin || {};
                partnerPortal.plugin.lastWarpTime = now;
                
                // ワープ演出用フラグ
                playerBody.plugin = playerBody.plugin || {};
                playerBody.plugin.justWarped = {
                  fromX: otherBody.position.x,
                  fromY: otherBody.position.y,
                  toX: partnerPortal.position.x,
                  toY: partnerPortal.position.y
                };
              }
            }
          } else if (otherLabel === 'item_metal' || otherLabel === 'item_rubber') {
            // 素材変更アイテム
            const itemPlugin = otherBody.plugin;
            if (itemPlugin && itemPlugin.active) {
              itemPlugin.active = false;
              itemPlugin.collectedFrame = 0;
              
              const isMetal = otherLabel === 'item_metal';
              const stateType = isMetal ? 'metal' : 'rubber';
              const stateConfig = isMetal ? GAME_CONFIG.ballMetal : GAME_CONFIG.ballRubber;
              
              playerBody.plugin = playerBody.plugin || {};
              playerBody.plugin.state = stateType;
              playerBody.plugin.stateTimer = stateConfig.duration;
              
              // 物理パラメータの動的書き換え
              Body.set(playerBody, {
                restitution: stateConfig.restitution,
                friction: stateConfig.friction
              });
              Body.setDensity(playerBody, stateConfig.density); // density変更で自動的にmass再計算
              
              // アイテム取得演出用フラグ
              playerBody.plugin.justCollectedItem = {
                type: stateType,
                x: otherBody.position.x,
                y: otherBody.position.y
              };
            }
          }
        }
      });
    });

    Events.on(this.engine, 'beforeUpdate', () => {
      this.updateDynamicBodies();
      this.updateBallStateAndItems();
    });
  }


  public initStage(n: number) {
    this.currentStage = n;
    World.clear(this.engine.world, false);
    
    // Add outer boundary walls
    const w = window.innerWidth;
    const h = window.innerHeight;
    const wallOptions = { isStatic: true, label: 'wall' };
    
    Composite.add(this.engine.world, [
      Bodies.rectangle(w/2, -25, w, 50, wallOptions),
      Bodies.rectangle(w/2, h + 25, w, 50, wallOptions),
      Bodies.rectangle(-25, h/2, 50, h, wallOptions),
      Bodies.rectangle(w + 25, h/2, 50, h, wallOptions)
    ]);

    // Stage specifics
    const player = Bodies.circle(w/2, h - 100, 15, { label: 'player', restitution: 0.5, friction: 0.01 });
    Composite.add(this.engine.world, player);

    // 共通のゴール設定
    const goalX = w / 2;
    const goalY = 100;
    const goal = Bodies.circle(goalX, goalY, 25, { isStatic: true, isSensor: true, label: 'goal' });

    if (n === 1) {
      // Stage 1: 穴と玉のみ（ギミックなし）
      Composite.add(this.engine.world, goal);
    } else if (n === 2) {
      // Stage 2: 5倍壁（圧倒的迂回）
      Composite.add(this.engine.world, goal);
      Composite.add(this.engine.world, [
        Bodies.rectangle(w/2, h/2, w * 0.8, 100, { isStatic: true, label: 'wall' })
      ]);
    } else if (n === 3) {
      // Stage 3: イライラ棒（絶対死守）
      Composite.add(this.engine.world, goal);
      Composite.add(this.engine.world, [
        Bodies.rectangle(w*0.4, h*0.3, w*0.8, 20, { isStatic: true, label: 'trap' }),
        Bodies.rectangle(w*0.6, h*0.5, w*0.8, 20, { isStatic: true, label: 'trap' }),
        Bodies.rectangle(w*0.4, h*0.7, w*0.8, 20, { isStatic: true, label: 'trap' })
      ]);
    } else if (n === 4) {
      // Stage 4: 無駄バンパー（無限反射）
      Composite.add(this.engine.world, goal);
      const bumpers = [];
      for(let i = 0; i < 5; i++) {
        for(let j = 0; j < 3; j++) {
          bumpers.push(Bodies.circle(w*0.2 + w*0.15*i, h*0.3 + h*0.15*j, 20, { isStatic: true, restitution: 1.5, label: 'bumper' }));
        }
      }
      Composite.add(this.engine.world, bumpers);
    } else if (n === 5) {
      // Stage 5: 3倍速風車×3（見た目倒し）
      Composite.add(this.engine.world, goal);
      const windmills = [
        Bodies.rectangle(w*0.25, h/2, w*0.2, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.09 } }),
        Bodies.rectangle(w*0.5, h/2, w*0.2, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.09 } }),
        Bodies.rectangle(w*0.75, h/2, w*0.2, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.09 } })
      ];
      Composite.add(this.engine.world, windmills);
    } else if (n === 6) {
      // Stage 6: 理不尽フェイント壁（プロ向け初見殺し）
      Composite.add(this.engine.world, goal);
      const feintWall = Bodies.rectangle(w/2, h/2, w*0.8, 20, { 
        isStatic: true, 
        label: 'moving_wall', 
        plugin: { type: 'feint_wall', phase: 0, speed: 0.04, originX: w/2, range: w*0.6 } 
      });
      Composite.add(this.engine.world, feintWall);
    } else if (n === 7) {
      // Stage 7: 3倍速逃げる穴（爆速鬼ごっこ） - 元Stage 8
      goal.plugin = { type: 'escaping_goal', speed: 4.5 };
      Composite.add(this.engine.world, goal);
    } else if (n === 8) {
      // Stage 8: 愛しの全画面風車（速度低下＆罠削減） - 元Stage 7
      Composite.add(this.engine.world, goal);
      const windmill = Bodies.rectangle(w/2, h/2, w*1.5, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.04 } });
      Composite.add(this.engine.world, [
        windmill,
        Bodies.circle(w*0.2, h*0.2, 40, { isStatic: true, label: 'trap' }),
        Bodies.circle(w*0.8, h*0.8, 40, { isStatic: true, label: 'trap' }) // 対角線の2隅のみに削減
      ]);
    } else if (n === 9) {
      // Stage 9: 複合（ピンボール＆壁） - トラップがフェイント移動する
      goal.position.y = 150;
      Composite.add(this.engine.world, [
        goal,
        Bodies.rectangle(w/2, 250, w*0.5, 20, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(w/2 - w*0.25, 200, 20, 100, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(w/2 + w*0.25, 200, 20, 100, { isStatic: true, label: 'wall' }),
        Bodies.circle(w*0.25, h*0.6, 30, { isStatic: true, restitution: 1.5, label: 'bumper' }),
        Bodies.circle(w*0.75, h*0.6, 30, { isStatic: true, restitution: 1.5, label: 'bumper' }),
        Bodies.circle(w/2, h*0.75, 30, { isStatic: true, restitution: 1.5, label: 'bumper' }),
        Bodies.rectangle(w/2, h*0.45, w*0.4, 20, { isStatic: true, label: 'trap', plugin: { type: 'feint_trap', phase: 0, speed: 0.05, originX: w/2, range: w*0.3 } })
      ]);
    } else if (n === 10) {
      // Stage 10: 巨大風車 × 反射パズル（チュートリアル最終試練）
      // 巨大風車との衝突を避けるため、プレイヤーの初期位置を右下にずらす
      Body.setPosition(player, { x: w * 0.85, y: h - 100 });

      Composite.remove(this.engine.world, goal);
      const bigGoal = Bodies.circle(w * 0.15, h * 0.15, 45, { isStatic: true, isSensor: true, label: 'goal' });

      // ステージ8の要素を融合：全画面を覆う巨大風車（w * 1.2）
      const giantWindmill = Bodies.rectangle(w/2, h/2, w * 1.2, 20, { 
        isStatic: true, 
        label: 'wall', 
        plugin: { type: 'windmill', speed: 0.04 } 
      });

      Composite.add(this.engine.world, [
        bigGoal,
        giantWindmill,
        
        // ゴール（左上）の受け皿
        Bodies.rectangle(w * 0.15, h * 0.25, 140, 20, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(w * 0.15 + 60, h * 0.15, 20, 180, { isStatic: true, label: 'wall' }),

        // 反射用の斜め壁（右下）
        Bodies.rectangle(w * 0.85, h * 0.75, 200, 20, { isStatic: true, angle: -Math.PI / 4, label: 'wall' }),

        // ゴールへの最終アシストバンパー（右上）
        Bodies.circle(w * 0.85, h * 0.15, 45, { 
          isStatic: true, 
          restitution: 1.5, 
          label: 'bumper' 
        }),

        // 障害物とトラップの配置（風車で弾かれた時の緊張感を演出）
        Bodies.circle(w * 0.1, h * 0.9, 45, { isStatic: true, label: 'trap' }), // 左下即死
        Bodies.circle(w * 0.5, h * 0.05, 45, { isStatic: true, label: 'trap' }), // 天井中央
        Bodies.circle(w * 0.15, h * 0.5, 30, { isStatic: true, label: 'trap' })  // ゴール下へのアプローチ防止用邪魔トラップ
      ]);
    } else if (n === 11) {
      // Stage 11: 「スイッチ＆ゲートの試練」（導入ステージ）
      Composite.add(this.engine.world, goal);
      
      const gateId = 'gate11';
      Composite.add(this.engine.world, [
        // ゲート（道を塞ぐ静的壁）
        Bodies.rectangle(w / 2, h * 0.45, w * 0.8, 20, { isStatic: true, label: 'gate', plugin: { gateId } }),
        
        // スイッチ（ゲートを開くセンサー）
        Bodies.circle(w * 0.2, h * 0.75, 20, { isStatic: true, isSensor: true, label: 'switch', plugin: { gateId, activated: false } }),
        
        // 装飾・障害物（イライラ棒的トラップ）
        Bodies.circle(w * 0.8, h * 0.75, 30, { isStatic: true, label: 'trap' }),
        Bodies.circle(w * 0.5, h * 0.3, 30, { isStatic: true, label: 'trap' })
      ]);
    } else if (n === 12) {
      // Stage 12: 「ポータル・デリバリー」（空間ワープと順序）
      Composite.add(this.engine.world, goal);
      
      const gateId = 'gate12';
      Composite.add(this.engine.world, [
        // 画面中央の仕切り壁
        Bodies.rectangle(w / 2, h * 0.5, w, 20, { isStatic: true, label: 'wall' }),
        
        // ポータルA（ワープ入口：下部） - ゲートで守られている
        Bodies.circle(w * 0.2, h * 0.8, 25, { isStatic: true, isSensor: true, label: 'portal', plugin: { portalId: 'P12A', partnerId: 'P12B' } }),
        Bodies.rectangle(w * 0.2, h * 0.7, w * 0.35, 18, { isStatic: true, label: 'gate', plugin: { gateId } }),
        
        // ポータルB（ワープ出口：上部）
        Bodies.circle(w * 0.8, h * 0.25, 25, { isStatic: true, isSensor: true, label: 'portal', plugin: { portalId: 'P12B', partnerId: 'P12A' } }),
        
        // スイッチ（下部右側）
        Bodies.circle(w * 0.8, h * 0.8, 20, { isStatic: true, isSensor: true, label: 'switch', plugin: { gateId, activated: false } }),
        
        // 上部エリアのお邪魔ギミック（緩めの風車）
        Bodies.rectangle(w * 0.5, h * 0.25, w * 0.3, 16, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.03 } }),
        
        // 四隅のトラップ
        Bodies.circle(w * 0.1, h * 0.15, 30, { isStatic: true, label: 'trap' }),
        Bodies.circle(w * 0.9, h * 0.85, 30, { isStatic: true, label: 'trap' })
      ]);
    } else if (n === 13) {
      // Stage 13: 「ヘビー・メタル・パズル」（メタルボールの慣性）
      Composite.add(this.engine.world, goal);
      
      Composite.add(this.engine.world, [
        // メタル化アイテム
        Bodies.circle(w * 0.5, h * 0.75, 18, { isStatic: true, isSensor: true, label: 'item_metal', plugin: { active: true } }),
        
        // 吹き飛ばす強風車（メタル化しないとトラップへ押し流される）
        Bodies.rectangle(w / 2, h * 0.45, w * 0.8, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.08 } }),
        
        // 風車の下にあるトラップ帯（通常ボールだと風車の回転で弾かれてここへ落ちる）
        Bodies.rectangle(w * 0.15, h * 0.55, 120, 20, { isStatic: true, label: 'trap' }),
        Bodies.rectangle(w * 0.85, h * 0.55, 120, 20, { isStatic: true, label: 'trap' }),
        
        // ゴール前のクッションバンパー
        Bodies.circle(w / 2, 220, 25, { isStatic: true, restitution: 1.2, label: 'bumper' })
      ]);
    } else if (n === 14) {
      // Stage 14: 「スーパーゴム・トリックショット」（大バウンドジャンプ）
      Composite.add(this.engine.world, goal);
      
      // 巨大仕切り壁（飛び越える必要がある）
      Composite.add(this.engine.world, [
        Bodies.rectangle(w * 0.5, h * 0.55, w * 0.75, 20, { isStatic: true, label: 'wall' }),
        
        // ゴム化アイテム（スタートエリア内）
        Bodies.circle(w * 0.2, h * 0.8, 18, { isStatic: true, isSensor: true, label: 'item_rubber', plugin: { active: true } }),
        
        // 飛び越えをアシストする高反発バンパー（壁の底や横）
        Bodies.circle(w * 0.85, h * 0.75, 35, { isStatic: true, restitution: 1.9, label: 'bumper' }),
        Bodies.circle(w * 0.15, h * 0.45, 30, { isStatic: true, restitution: 1.9, label: 'bumper' }),
        
        // 飛び越えた先のトラップ（精密に着地しないと即死）
        Bodies.circle(w * 0.5, h * 0.35, 35, { isStatic: true, label: 'trap' }),
        
        // リスキル防止の即死トラップ（下部隅）
        Bodies.circle(w * 0.1, h * 0.95, 30, { isStatic: true, label: 'trap' })
      ]);
    } else if (n === 15) {
      // Stage 15: 最終試練「クロニクル・オブ・グラビティ」（超複合・集大成パズル）
      // プレイヤーの初期位置を左下に
      Body.setPosition(player, { x: w * 0.15, y: h - 100 });
      
      // 近づくと逃げるゴール
      goal.plugin = { type: 'escaping_goal', speed: 2.8 };
      Composite.add(this.engine.world, goal);
      
      const gateId = 'gate15';
      Composite.add(this.engine.world, [
        // 領域を区切る壁
        Bodies.rectangle(w * 0.4, h * 0.6, 20, h * 0.8, { isStatic: true, label: 'wall' }), // 縦壁
        Bodies.rectangle(w * 0.7, h * 0.4, w * 0.6, 20, { isStatic: true, label: 'wall' }), // 横壁
        
        // 1. エリア1（左下）：ゴムアイテム
        Bodies.circle(w * 0.15, h * 0.75, 18, { isStatic: true, isSensor: true, label: 'item_rubber', plugin: { active: true } }),
        
        // 2. エリア2（右下）：スイッチとアシストバンパー
        Bodies.circle(w * 0.85, h * 0.8, 20, { isStatic: true, isSensor: true, label: 'switch', plugin: { gateId, activated: false } }),
        Bodies.circle(w * 0.85, h * 0.6, 30, { isStatic: true, restitution: 1.8, label: 'bumper' }),
        
        // 3. エリア3（下部中央）：ポータルA（ゲートで封鎖）
        Bodies.rectangle(w * 0.5, h * 0.7, 100, 20, { isStatic: true, label: 'gate', plugin: { gateId } }),
        Bodies.circle(w * 0.5, h * 0.85, 25, { isStatic: true, isSensor: true, label: 'portal', plugin: { portalId: 'P15A', partnerId: 'P15B' } }),
        
        // 4. エリア4（左上）：ポータルB、メタルアイテム、風車
        Bodies.circle(w * 0.15, h * 0.35, 25, { isStatic: true, isSensor: true, label: 'portal', plugin: { portalId: 'P15B', partnerId: 'P15A' } }),
        Bodies.circle(w * 0.15, h * 0.15, 18, { isStatic: true, isSensor: true, label: 'item_metal', plugin: { active: true } }),
        
        // 吹き流し風車
        Bodies.rectangle(w * 0.35, h * 0.25, 120, 16, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.06 } }),
        
        // 落下トラップ
        Bodies.rectangle(w * 0.35, h * 0.35, 120, 20, { isStatic: true, label: 'trap' }),
        
        // 右隅の即死トラップ（逃げるゴールとのせめぎ合い）
        Bodies.circle(w * 0.95, h * 0.1, 30, { isStatic: true, label: 'trap' })
      ]);
    }

    this.onStageChange(this.currentStage);
  }

  public getCurrentStage() {
    return this.currentStage;
  }

  private handleClear() {
    this.onClear();
  }

  private handleMiss() {
    this.onMiss();
  }

  private updateDynamicBodies() {
    const bodies = Composite.allBodies(this.engine.world);
    const player = bodies.find(b => b.label === 'player');
    
    if (player && player.plugin && player.plugin.isClearing) {
      // 穴に吸い込まれる処理
      const goal = player.plugin.goalRef;
      if (goal) {
        // 物理演算を無視してゴール中央に激しく寄せる
        Body.setVelocity(player, { x: 0, y: 0 });
        const dx = goal.position.x - player.position.x;
        const dy = goal.position.y - player.position.y;
        Body.setPosition(player, { 
          x: player.position.x + dx * 0.4, 
          y: player.position.y + dy * 0.4 
        });
        
        // ぐるぐる回転しながら吸い込まれる演出
        Body.setAngle(player, player.angle + 0.4);
        
        // スケールを急激に縮小
        if (player.plugin.scale === undefined) player.plugin.scale = 1;
        player.plugin.scale -= 0.12;
        if (player.plugin.scale < 0) player.plugin.scale = 0;
      }
    }

    if (!player) return;

    for (const body of bodies) {
      const plugin = body.plugin as any;
      if (!plugin) continue;

      if (plugin.type === 'escaping_goal') {
        const dx = player.position.x - body.position.x;
        const dy = player.position.y - body.position.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < 300) {
          const vx = -(dx / dist) * plugin.speed;
          const vy = -(dy / dist) * plugin.speed;
          // Boundary limits
          let nx = body.position.x + vx;
          let ny = body.position.y + vy;
          if (nx < 50) nx = 50;
          if (nx > window.innerWidth - 50) nx = window.innerWidth - 50;
          if (ny < 50) ny = 50;
          if (ny > window.innerHeight - 50) ny = window.innerHeight - 50;
          
          Body.setPosition(body, { x: nx, y: ny });
        }
      } else if (plugin.type === 'windmill') {
        Body.setAngle(body, body.angle + plugin.speed);
      } else if (plugin.type === 'feint_wall' || plugin.type === 'feint_trap') {
        plugin.phase += plugin.speed;
        
        // Custom Easing function for Feint (slow start, fast snap)
        const normalizedPhase = Math.sin(plugin.phase);
        const feintOffset = Math.pow(normalizedPhase, 3) * plugin.range;
        
        Body.setPosition(body, { x: plugin.originX + feintOffset, y: body.position.y });
        
        // Telegraphing visual state
        const isTelegraph = Math.abs(normalizedPhase) > 0.95;
        if (plugin.type === 'feint_wall') {
          body.label = isTelegraph ? 'moving_wall_telegraph' : 'moving_wall';
        } else {
          body.label = isTelegraph ? 'moving_trap_telegraph' : 'trap';
        }
      }
    }
  }

  private updateBallStateAndItems() {
    const bodies = Composite.allBodies(this.engine.world);
    const player = bodies.find(b => b.label === 'player');
    
    // プレイヤーの変身時間減算
    if (player && player.plugin && player.plugin.state) {
      if (player.plugin.stateTimer > 0) {
        player.plugin.stateTimer--;
      } else {
        // 通常状態に戻す
        player.plugin.state = null;
        Body.set(player, {
          restitution: GAME_CONFIG.ballNormal.restitution,
          friction: GAME_CONFIG.ballNormal.friction
        });
        Body.setDensity(player, GAME_CONFIG.ballNormal.density);
      }
    }
    
    // アイテムの復活時間更新
    for (const body of bodies) {
      if (body.label === 'item_metal' || body.label === 'item_rubber') {
        const plugin = body.plugin;
        if (plugin && !plugin.active) {
          plugin.collectedFrame++;
          if (plugin.collectedFrame >= GAME_CONFIG.itemRespawnTime) {
            plugin.active = true;
            plugin.collectedFrame = 0;
          }
        }
      }
    }
  }
}

