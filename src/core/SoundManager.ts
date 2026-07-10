export class SoundManager {
  private ctx: AudioContext | null = null;

  public init() {
    // ユーザーインタラクション時にAudioContextを初期化
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
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

  // ==== BGM（モックアップ） ====
  private bgmIntervalId: number | null = null;
  private droneOscillator: OscillatorNode | null = null;

  public playBGM(_stage?: number) {
    if (!this.ctx) return;
    
    // 全ステージ共通でケルト風BGM（アルタン風）を流す
    if (this.bgmIntervalId !== null) {
      return; // すでに再生中ならそのまま
    }

    this.stopBGM();

    // ケルト風ジグ (6/8拍子) のメロディ (Dドリアン)
    // 1パート = 8小節 = 48音
    const partA = `
      D4 D4 D4 A4 G4 F4 E4 C4 E4 G4 F4 E4 D4 D4 D4 A4 G4 F4 G4 A4 B4 C5 D5 C5
      D4 D4 D4 A4 G4 F4 E4 C4 E4 G4 F4 E4 D4 D4 D4 A4 B4 C5 D5 A4 G4 F4 E4 D4
    `;
    const partB = `
      D5 D5 D5 D5 C5 A4 C5 C5 C5 C5 A4 G4 D5 D5 D5 D5 E5 F5 G5 F5 E5 D5 C5 A4
      D5 D5 D5 D5 C5 A4 C5 C5 C5 C5 A4 G4 A4 B4 C5 D5 E5 F5 G5 F5 E5 D5 C5 D5
    `;
    const partC = `
      A4 A4 A4 D5 D5 D5 A4 A4 A4 C5 C5 C5 A4 A4 A4 D5 D5 D5 E5 F5 G5 F5 E5 C5
      A4 A4 A4 D5 D5 D5 A4 A4 A4 C5 C5 C5 D5 C5 A4 G4 F4 E4 D4 E4 F4 D4 D4 D4
    `;
    const partD = `
      F4 G4 A4 D4 D4 D4 F4 G4 A4 E4 C4 C4 F4 G4 A4 D4 D4 D4 C5 B4 A4 G4 F4 E4
      F4 G4 A4 D4 D4 D4 F4 G4 A4 E4 C4 C4 A4 B4 C5 D5 C5 A4 G4 F4 E4 D4 D4 D4
    `;
    // AABBCCDDEEFF... 伝統的なアイリッシュリールの構成
    // 合計 384音 x 0.26秒 = 約99.8秒のループ
    const fullTune = partA + partA + partB + partB + partC + partC + partD + partD;

    const notesMap: {[key: string]: number} = {
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
      'r': 0
    };

    const sequence: {note: number, duration: number}[] = [];
    const tokens = fullTune.trim().split(/\s+/);
    for (const t of tokens) {
      if (t && notesMap[t] !== undefined) {
        sequence.push({ note: notesMap[t], duration: 0.26 });
      }
    }

    // ティン・ホイッスルやフィドルのような高音の三角波でメロディを再生
    this.playCelticTune(sequence, 0.26, 'triangle');
    
    // アイリッシュ音楽特有の「ドローン音（バグパイプのような持続音）」を鳴らす
    this.playDrone(146.83); // D3
  }

  private stopBGM() {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    if (this.droneOscillator) {
      this.droneOscillator.stop();
      this.droneOscillator = null;
    }
  }

  private playDrone(freq: number) {
    if (!this.ctx) return;
    this.droneOscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    this.droneOscillator.type = 'sawtooth';
    this.droneOscillator.frequency.value = freq;
    // 邪魔にならない程度の極小ボリューム
    gain.gain.value = 0.015;
    this.droneOscillator.connect(gain);
    gain.connect(this.ctx.destination);
    this.droneOscillator.start();
  }

  private playCelticTune(sequence: {note: number, duration: number}[], baseTempo: number, waveType: OscillatorType) {
    if (!this.ctx || sequence.length === 0) return;
    
    let step = 0;
    const playNextNote = () => {
      const current = sequence[step % sequence.length];
      if (current.note > 0) {
        // ケルト音楽の軽快な装飾音（スタッカート気味に切る）を表現
        this.playTone(current.note, waveType, current.duration * 0.8, 0.08);
      }
      step++;
    };

    // 最初の音を鳴らす
    playNextNote();
    // 以降はベーステンポに合わせてループ
    this.bgmIntervalId = window.setInterval(playNextNote, baseTempo * 1000);
  }
}
