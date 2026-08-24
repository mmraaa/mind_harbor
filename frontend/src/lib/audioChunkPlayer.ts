/** 句子级 audio_chunk 播放器：按 seq 排队，句到即播，不等整段。 */

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export class SentenceAudioQueue {
  private ctx: AudioContext | null = null
  private buffers = new Map<number, AudioBuffer>()
  private pending = new Set<number>()
  private nextSeq = 0
  private playing = false
  private stopped = false
  private current: AudioBufferSourceNode | null = null

  unlock() {
    void this.ensureContext()?.resume()
  }

  reset() {
    this.stopped = false
    this.nextSeq = 0
    this.buffers.clear()
    this.pending.clear()
    try {
      this.current?.stop()
    } catch {
      // already stopped
    }
    this.current = null
    this.playing = false
  }

  stop() {
    this.stopped = true
    this.buffers.clear()
    this.pending.clear()
    try {
      this.current?.stop()
    } catch {
      // already stopped
    }
    this.current = null
    this.playing = false
  }

  async enqueue(seq: number, data: string) {
    if (this.stopped || !data) return
    const ctx = this.ensureContext()
    if (!ctx) return
    this.pending.add(seq)
    await ctx.resume()
    try {
      const copy = base64ToArrayBuffer(data).slice(0)
      const decoded = await ctx.decodeAudioData(copy)
      if (this.stopped) return
      this.buffers.set(seq, decoded)
    } catch {
      // 单句解码失败：不入队，drain 会跳过该 seq
    } finally {
      this.pending.delete(seq)
    }
    void this.drain()
  }

  private ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') {
      return null
    }
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      this.ctx = new Ctor()
    }
    return this.ctx
  }

  private hasLaterChunk(seq: number) {
    for (const key of this.buffers.keys()) {
      if (key > seq) return true
    }
    for (const key of this.pending) {
      if (key > seq) return true
    }
    return false
  }

  private async drain() {
    if (this.playing || this.stopped) return
    const ctx = this.ctx
    if (!ctx) return

    while (!this.stopped) {
      if (this.buffers.has(this.nextSeq)) {
        const buffer = this.buffers.get(this.nextSeq)!
        this.buffers.delete(this.nextSeq)
        this.nextSeq += 1
        this.playing = true
        await this.play(ctx, buffer)
        this.playing = false
        continue
      }
      if (this.pending.has(this.nextSeq)) break
      // TTS 跳过了该句：后续 seq 已到，不必死等
      if (this.hasLaterChunk(this.nextSeq)) {
        this.nextSeq += 1
        continue
      }
      break
    }
  }

  private play(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      if (this.stopped) {
        resolve()
        return
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      this.current = src
      src.onended = () => {
        if (this.current === src) this.current = null
        resolve()
      }
      try {
        src.start()
      } catch {
        resolve()
      }
    })
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
