export class AudioManager {
  private clips = new Set<HTMLAudioElement>();
  muted = false;
  volume = 1;

  register(audio: HTMLAudioElement): HTMLAudioElement {
    this.clips.add(audio);
    audio.volume = this.volume;
    audio.muted = this.muted;
    return audio;
  }

  play(audio: HTMLAudioElement, options: { loop?: boolean; restart?: boolean } = {}): void {
    const clip = this.register(audio);
    clip.loop = options.loop ?? false;
    if (options.restart) {
      clip.currentTime = 0;
    }
    void clip.play();
  }

  stop(audio: HTMLAudioElement): void {
    audio.pause();
    audio.currentTime = 0;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const clip of this.clips) {
      clip.muted = muted;
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    for (const clip of this.clips) {
      clip.volume = this.volume;
    }
  }

  dispose(): void {
    for (const clip of this.clips) {
      this.stop(clip);
    }
    this.clips.clear();
  }
}
