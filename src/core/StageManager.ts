import { Engine, World, Bodies, Body, Composite, Events } from 'matter-js';

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
            const speed = 12; // 適度な初速（Velocityを強制上書き）
            Body.setVelocity(playerBody, {
              x: (dx / dist) * speed,
              y: (dy / dist) * speed
            });
          }
        }
      });
    });

    Events.on(this.engine, 'beforeUpdate', () => {
      this.updateDynamicBodies();
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
      // Stage 7: 愛しの全画面風車（速度低下＆罠削減）
      Composite.add(this.engine.world, goal);
      const windmill = Bodies.rectangle(w/2, h/2, w*1.5, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.04 } });
      Composite.add(this.engine.world, [
        windmill,
        Bodies.circle(w*0.2, h*0.2, 40, { isStatic: true, label: 'trap' }),
        Bodies.circle(w*0.8, h*0.8, 40, { isStatic: true, label: 'trap' }) // 対角線の2隅のみに削減
      ]);
    } else if (n === 8) {
      // Stage 8: 3倍速逃げる穴（爆速鬼ごっこ）
      goal.plugin = { type: 'escaping_goal', speed: 4.5 };
      Composite.add(this.engine.world, goal);
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
      // Stage 10: 直感ビリヤードパズル ＋ 風車先輩の帰還
      // プレイヤーが考える時間は安全地帯で確保しつつ、Z字反射ルートの途中に風車が立ち塞がる。
      Composite.remove(this.engine.world, goal);
      const bigGoal = Bodies.circle(w * 0.15, h * 0.15, 45, { isStatic: true, isSensor: true, label: 'goal' });

      // 風車先輩の復帰（初期位置のプレイヤーには絶対に届かない「w * 0.8」の長さに抑制）
      const windmill = Bodies.rectangle(w/2, h/2, w*0.8, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.04 } });

      Composite.add(this.engine.world, [
        bigGoal,
        windmill,
        
        // ゴール（左上）の受け皿。スポッと入る快感を重視。
        Bodies.rectangle(w * 0.15, h * 0.25, 140, 20, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(w * 0.15 + 60, h * 0.15, 20, 180, { isStatic: true, label: 'wall' }),

        // 反射用の斜め壁（右下）
        // プレイヤーが右下に向かって撃つと、この壁に当たって「真上」へ反射する
        Bodies.rectangle(w * 0.85, h * 0.75, 200, 20, { isStatic: true, angle: -Math.PI / 4, label: 'wall' }),

        // ゴールへの最終アシストバンパー（右上・天井付近）
        // 真上に飛んできたボールがこれに当たり、「左」へ反射してゴールへ向かう
        Bodies.circle(w * 0.85, h * 0.15, 45, { 
          isStatic: true, 
          restitution: 1.5, 
          label: 'bumper' 
        })
      ]);
    } else if (n === 11) {
      // Stage 11: 複合（風車＆トラップ＆逃げる穴）
      goal.plugin = { type: 'escaping_goal', speed: 1.5 };
      const windmill = Bodies.rectangle(w/2, h/2, w*1.5, 20, { isStatic: true, label: 'wall', plugin: { type: 'windmill', speed: 0.04 } });
      Composite.add(this.engine.world, [
        goal,
        windmill,
        Bodies.circle(w*0.2, h*0.2, 40, { isStatic: true, label: 'trap' }),
        Bodies.circle(w*0.8, h*0.2, 40, { isStatic: true, label: 'trap' }),
        Bodies.circle(w*0.2, h*0.8, 40, { isStatic: true, label: 'trap' }),
        Bodies.circle(w*0.8, h*0.8, 40, { isStatic: true, label: 'trap' })
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
}
