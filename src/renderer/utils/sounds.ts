/**
 * Bundled notification sounds using the Web Audio API.
 *
 * Generates short synth tones at runtime — no audio files needed,
 * works identically across macOS, Windows, and Linux.
 */

type SoundGenerator = (ctx: AudioContext) => void;

function schedule(ctx: AudioContext, fn: (t: number) => void, time: number) {
	fn(ctx.currentTime + time);
}

const SOUNDS: Record<string, SoundGenerator> = {
	/**
	 * Chime — two-note ascending major third, warm sine tone.
	 */
	Chime(ctx) {
		const gain = ctx.createGain();
		gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0.25, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

		const osc1 = ctx.createOscillator();
		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
		osc1.connect(gain);
		osc1.start(ctx.currentTime);
		osc1.stop(ctx.currentTime + 0.35);

		const gain2 = ctx.createGain();
		gain2.connect(ctx.destination);
		gain2.gain.setValueAtTime(0, ctx.currentTime);
		schedule(
			ctx,
			(t) => {
				gain2.gain.setValueAtTime(0.25, t);
				gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
			},
			0.15
		);

		const osc2 = ctx.createOscillator();
		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(739.99, ctx.currentTime); // F#5
		osc2.connect(gain2);
		osc2.start(ctx.currentTime + 0.15);
		osc2.stop(ctx.currentTime + 0.8);
	},

	/**
	 * Ping — short, bright pluck.
	 */
	Ping(ctx) {
		const gain = ctx.createGain();
		gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0.3, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(1200, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
		osc.connect(gain);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.4);
	},

	/**
	 * Bloom — soft rising pad, three staggered harmonics.
	 */
	Bloom(ctx) {
		const freqs = [440, 554.37, 659.25]; // A4, C#5, E5
		freqs.forEach((freq, i) => {
			const gain = ctx.createGain();
			gain.connect(ctx.destination);
			const offset = i * 0.08;
			gain.gain.setValueAtTime(0, ctx.currentTime + offset);
			gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + offset + 0.15);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.9);

			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, ctx.currentTime);
			osc.connect(gain);
			osc.start(ctx.currentTime + offset);
			osc.stop(ctx.currentTime + offset + 0.9);
		});
	},

	/**
	 * Drop — descending tone, playful notification.
	 */
	Drop(ctx) {
		const gain = ctx.createGain();
		gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0.25, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

		const osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(1400, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);
		osc.connect(gain);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.5);
	},

	/**
	 * Tink — tiny metallic tap, very subtle.
	 */
	Tink(ctx) {
		const gain = ctx.createGain();
		gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0.2, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

		const osc = ctx.createOscillator();
		osc.type = 'square';
		osc.frequency.setValueAtTime(2400, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.05);
		osc.connect(gain);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.15);
	},
};

/** Names of all available sounds. */
export const SOUND_NAMES = Object.keys(SOUNDS);

/** Default sound for new installs. */
export const DEFAULT_SOUND = 'Chime';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx) {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

/**
 * Play a bundled notification sound by name.
 * No-ops silently if the name is 'none' or unrecognised.
 */
export function playSound(name: string): void {
	if (name === 'none') return;
	const generator = SOUNDS[name];
	if (!generator) return;

	const ctx = getAudioContext();
	// Resume in case the context was suspended (autoplay policy)
	if (ctx.state === 'suspended') {
		ctx.resume().then(() => generator(ctx));
	} else {
		generator(ctx);
	}
}
