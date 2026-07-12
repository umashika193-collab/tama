export class SoundManager {
  private ctx: AudioContext | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private currentBgmPath: string | null = null;

  public init() {
    // ユーザーインタラクション時にAudioContextを初期化
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    // すでにロード済みのオーディオがある場合は再生を再開試行
    if (this.bgmAudio && this.bgmAudio.paused) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  // ==== 効果音（SE）のシンセサイズ ====
  public playHitWall() {
    this.playTone(150, 'triangle', 0.1, 0.1);
  }

  public playBumper() {
    this.playTone(400, 'sine', 0.3, 0.4, 800); // ピッチアップ
  }

  public playClear() {
    this.playTone(523.25, 'sine', 0.1, 0.5); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.5), 100); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.1, 0.5), 200); // G5
    setTimeout(() => this.playTone(1046.50, 'sine', 0.2, 0.5), 300); // C6
  }

  public playMiss() {
    this.playTone(200, 'sawtooth', 0.5, 0.5, 50); // ピッチダウン（ヒュ〜ドスン）
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number, endFreq?: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
    }
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // ==== BGM（MP3再生） ====
  public playBGM(isTitle: boolean) {
    // タイトル画面は test2.mp3、プレイ中（全ステージ）は test1.mp3 を再生
    const filename = isTitle ? 'test2.mp3' : 'test1.mp3';
    
    // ViteのBASE_URL（/tama/等）を考慮したパスの生成
    const base = (import.meta as any).env?.BASE_URL || '/';
    const bgmPath = `${base}${filename}`;

    // すでに同じBGMがロードされ、再生中の場合は何もしない（一時停止から再開含む）
    if (this.currentBgmPath === bgmPath && this.bgmAudio) {
      if (this.bgmAudio.paused) {
        this.bgmAudio.play().catch(() => {});
      }
      return;
    }

    // 異なるBGMが要求された場合は一度停止・クリア
    this.stopBGM();

    this.currentBgmPath = bgmPath;
    this.bgmAudio = new Audio(bgmPath);
    this.bgmAudio.loop = true;
    this.bgmAudio.volume = 0.20; // 適切な音量（20%）

    this.bgmAudio.play().catch((err) => {
      console.warn('BGM play deferred until user interaction:', err);
    });
  }

  public stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.removeAttribute('src'); // メモリリーク防止のためオーディオソースを解放
      this.bgmAudio.load();
      this.bgmAudio = null;
    }
    this.currentBgmPath = null;
  }

  // 画面が非表示（バックグラウンド）になった際に音を停止する
  public pauseBGM() {
    if (this.bgmAudio && !this.bgmAudio.paused) {
      this.bgmAudio.pause();
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  // 画面が表示（アクティブ）に戻った際に音を再開する
  public resumeBGM() {
    if (this.bgmAudio && this.bgmAudio.paused) {
      this.bgmAudio.play().catch(() => {});
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
