window.onerror = function (msg) {
  const statusMessage = document.getElementById('statusMessage');
  if (statusMessage) {
    statusMessage.style.display = 'block';
    statusMessage.style.fontSize = '12px';
    statusMessage.textContent = 'Error: ' + msg;
  }
  return false;
};

import './style.css';
import { Engine, Runner } from 'matter-js';
import * as PIXI from 'pixi.js';
import { InputManager } from './core/InputManager';
import { Renderer } from './core/Renderer';
import { StageManager } from './core/StageManager';
import { SoundManager } from './core/SoundManager';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';
// import { Pane } from 'tweakpane';
// import { GAME_CONFIG } from './core/Config';

// Tweakpane UI initialization (God Mode Off)
/*
const tunerContainer = document.getElementById('tunerContainer');
const pane = new Pane({ 
  title: 'God Mode (Tuner)',
  container: tunerContainer || document.body
});
const p = pane as any;
p.addBinding(GAME_CONFIG, 'bumperSpeed', { min: 5, max: 30, step: 1 });
p.addBinding(GAME_CONFIG, 'stage10WindmillSpeed', { min: 0.01, max: 0.1, step: 0.005 });
p.addBinding(GAME_CONFIG, 'stage10WindmillWidthRatio', { min: 0.4, max: 1.5, step: 0.1 });
p.addButton({ title: 'Restart Stage' }).on('click', () => {
  const titleScreen = document.getElementById('titleScreen');
  if (titleScreen && titleScreen.style.display === 'none') {
    window.dispatchEvent(new CustomEvent('restartStageEvent'));
  }
});
*/

// @ts-ignore
declare const __APP_VERSION__: string;

// PWA Service Worker Registration
registerSW({ immediate: true });

// DOM Elements
const startButton = document.getElementById('startButton')!;
const titleScreen = document.getElementById('titleScreen')!;
const endingScreen = document.getElementById('endingScreen')!;
const restartButton = document.getElementById('restartButton')!;
const gameContainer = document.getElementById('gameContainer')!;
const stageIndicator = document.getElementById('stageIndicator')!;
const statusMessage = document.getElementById('statusMessage')!;
const versionDisplay = document.getElementById('versionDisplay')!;

if (versionDisplay && typeof __APP_VERSION__ !== 'undefined') {
  versionDisplay.textContent = __APP_VERSION__;
}

// 1. Initialize PixiJS Application
const app = new PIXI.Application();
(async () => {
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0, // CSS background will show through
    antialias: true,
  });
  gameContainer.appendChild(app.canvas);

  // Pixi Ticker Loop for Rendering
  app.ticker.add(() => {
    renderer.render();
  });
})();

// 2. Initialize Matter.js Engine
// 2. Initialize Core Managers
const engine = Engine.create();
engine.gravity.x = 0;
engine.gravity.y = 0;
const runner = Runner.create();

const soundManager = new SoundManager();
const inputManager = new InputManager(engine);
const renderer = new Renderer(app, engine);
const stageManager = new StageManager(engine);
const urlParams = new URLSearchParams(window.location.search);
const startStageParam = urlParams.get('stage');
let currentStage = startStageParam ? parseInt(startStageParam, 10) : 1; // テストモードオフ（ステージ1から開始）
const initialStage = currentStage;
let isGameOver = false;

stageManager.onClear = () => {
  soundManager.playClear();
  if (stageManager.getCurrentStage() >= 10) {
    endingScreen.style.display = 'block';
    restartButton.style.display = 'none';
    
    // アニメーションをリセットして再生
    const roll = document.querySelector('.credits-roll') as HTMLElement;
    if (roll) {
      roll.style.animation = 'none';
      roll.offsetHeight; // trigger reflow
      roll.style.animation = 'scrollCredits 12s linear forwards';
    }

    setTimeout(() => {
      restartButton.style.display = 'block';
    }, 12500);
  } else {
    statusMessage.textContent = 'STAGE CLEAR!';
    statusMessage.className = '';
    statusMessage.style.display = 'block';
    setTimeout(() => {
      statusMessage.style.display = 'none';
      stageManager.initStage(stageManager.getCurrentStage() + 1);
    }, 2000);
  }
};

stageManager.onMiss = () => {
  soundManager.playMiss();
  statusMessage.textContent = 'MISS...';
  statusMessage.className = 'miss';
  statusMessage.style.display = 'block';
  setTimeout(() => {
    statusMessage.style.display = 'none';
    stageManager.initStage(stageManager.getCurrentStage());
  }, 1000);
};

stageManager.onStageChange = (stage) => {
  stageIndicator.textContent = `STAGE ${stage}`;
  stageIndicator.style.display = 'block';
  soundManager.playBGM(stage);
};


// Wake Lock API
let wakeLock: any = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('Wake Lock acquired');
    }
  } catch (err) {
    console.warn('Wake Lock failed:', err);
  }
}

document.addEventListener('visibilitychange', async () => {
  // Wake Lock API Resume
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
  
  // Audio Context Pause/Resume
  if (document.hidden) {
    (soundManager as any).ctx?.suspend();
  } else {
    (soundManager as any).ctx?.resume();
  }
});

// START GAME LOGIC
startButton.addEventListener('click', async () => {
  titleScreen.style.display = 'none';

  // 1. Fullscreen & Orientation Lock
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    if (screen.orientation && (screen.orientation as any).lock) {
      await (screen.orientation as any).lock('portrait');
    }
  } catch (e) {
    console.warn('Orientation lock failed:', e);
  }

  // 2. Wake Lock
  await requestWakeLock();

  // 3. Audio Context
  soundManager.init();

  // 4. DeviceOrientation Unlocking
  if (typeof (DeviceOrientationEvent as any) !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    try {
      const permissionState = await (DeviceOrientationEvent as any).requestPermission();
      if (permissionState === 'granted') {
        inputManager.enableGyro();
      } else {
        alert('ジャイロセンサーが許可されませんでした。PC操作モードを使用します。');
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    inputManager.enableGyro();
  }

  inputManager.enablePCInput();

  // Start Physics and Game Loop
  Runner.run(runner, engine);
  if (isGameOver) {
    // restart game
    isGameOver = false;
    currentStage = initialStage; // ミスした場合は開始ステージからやり直し
  }
  titleScreen.style.display = 'none';
  soundManager.init();
  stageManager.initStage(currentStage);
});

restartButton.addEventListener('click', () => {
  endingScreen.style.display = 'none';
  stageManager.initStage(initialStage);
});

window.addEventListener('restartStageEvent', () => {
  if (!isGameOver) {
    stageManager.initStage(currentStage);
  }
});

// ==== PWA Installation Logic ====
const installContainer = document.getElementById('installContainer')!;
const installButton = document.getElementById('installButton')!;
let deferredPrompt: any = null;

// インストール済みか（PWAとして起動しているか）判定
// manifestで display: 'fullscreen' を指定しているため、fullscreen の判定も必須
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                     window.matchMedia('(display-mode: fullscreen)').matches || 
                     (navigator as any).standalone;
const ua = navigator.userAgent;
// 代表的なIn-Appブラウザ（PWAインストール非対応）
const inAppBrowsers = ['Line', 'Instagram', 'FBAV', 'FBAN', 'Twitter', 'MicroMessenger'];
const isInApp = inAppBrowsers.some(rule => ua.includes(rule));
// iOS判定
const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;

if (!isStandalone) {
  if (isInApp) {
    // In-Appブラウザの場合：「標準ブラウザで開く」を促す
    installContainer.style.display = 'block';
    installButton.textContent = '標準ブラウザで開く';
    installButton.addEventListener('click', () => {
      const url = window.location.href;
      const isAndroid = /Android/.test(ua);
      
      if (isAndroid) {
        // Androidの場合はIntentを使って強制的にChromeを開く
        const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end;`;
        window.location.href = intentUrl;
      } else if (ua.includes('Line')) {
        // LINEの場合は専用パラメータを付与してリロードすると外部ブラウザで開く仕様がある
        window.location.href = url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
      } else {
        // その他のiOSアプリ内ブラウザ等（プログラムから強制突破できない場合）
        alert('画面右上のメニュー（⋮）または右下のメニューから「Safariで開く（ブラウザで開く）」を選択してください。');
      }
    });
  } else {
    // PWA対応ブラウザ（Android Chrome等）や、デスクトップブラウザの場合
    // beforeinstallpromptが発火しなくても、まずはボタンを表示しておく
    installContainer.style.display = 'block';
    installButton.textContent = 'アプリをインストールする';

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });
    
    installButton.addEventListener('click', async () => {
      if (deferredPrompt) {
        // ネイティブのインストールプロンプトを表示
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installContainer.style.display = 'none';
        }
        deferredPrompt = null;
      } else if (isIOS) {
        // iOS Safari等の場合（beforeinstallpromptが発火しないため手動案内）
        alert('iOSの場合、画面下部の「共有（四角から矢印が飛び出たアイコン）」をタップし、「ホーム画面に追加」を選択してインストールしてください。');
      } else {
        // デスクトップ環境や自己署名証明書（開発環境）でイベントが発火しなかった場合の手動案内
        alert('お使いのブラウザのメニュー（右上にある ⋮ や ≡ など）から「アプリをインストール」または「ホーム画面に追加」を選択してください。\\n\\n※既にインストール済みの場合や、非対応ブラウザの場合はメニューに表示されません。');
      }
    });
  }
}
