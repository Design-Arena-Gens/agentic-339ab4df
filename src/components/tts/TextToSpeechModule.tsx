"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeSpeak } from "mespeak";
import config from "mespeak/mespeak_config.json";
import voiceNeutral from "mespeak/voices/en/en.json";
import voiceUS from "mespeak/voices/en/en-us.json";
import voiceWestMidlands from "mespeak/voices/en/en-wm.json";
import voiceReceivedPronunciation from "mespeak/voices/en/en-rp.json";
import voiceScotland from "mespeak/voices/en/en-sc.json";
import voiceNorthern from "mespeak/voices/en/en-n.json";
import { Mp3Encoder } from "lamejs";
import { ProgressBar } from "@/components/ui/ProgressBar";

type EmotionId = "neutral" | "happy" | "sad" | "intense" | "mysterious" | "epic";

export type GeneratedAudio = {
  url: string;
  fileName: string;
  blob: Blob;
  duration: number;
};

type TextToSpeechModuleProps = {
  onAudioReady?: (audio: GeneratedAudio) => void;
};

type VoiceOption = {
  id: string;
  label: string;
  category: "Masculina" | "Feminina";
  style: string;
  voiceId: string;
  variant?: string;
  speedOffset?: number;
  pitchOffset?: number;
};

type EmotionOption = {
  id: EmotionId;
  label: string;
  pitchDelta: number;
  speedDelta: number;
  amplitudeDelta: number;
};

const VOICE_LIBRARY: VoiceOption[] = [
  {
    id: "male-deep",
    label: "Deep/Grave",
    category: "Masculina",
    style: "deep",
    voiceId: voiceWestMidlands.voice_id,
    speedOffset: -35,
    pitchOffset: -10,
    variant: "m1",
  },
  {
    id: "male-neutral",
    label: "Neutro",
    category: "Masculina",
    style: "neutral",
    voiceId: voiceUS.voice_id,
  },
  {
    id: "male-energetic",
    label: "Energética",
    category: "Masculina",
    style: "energetic",
    voiceId: voiceNorthern.voice_id,
    speedOffset: 20,
    pitchOffset: 6,
  },
  {
    id: "male-narrative",
    label: "Narrativa",
    category: "Masculina",
    style: "narrative",
    voiceId: voiceReceivedPronunciation.voice_id,
    speedOffset: -10,
  },
  {
    id: "female-soft",
    label: "Suave",
    category: "Feminina",
    style: "soft",
    voiceId: voiceNeutral.voice_id,
    pitchOffset: 8,
    speedOffset: -10,
    variant: "f1",
  },
  {
    id: "female-powerful",
    label: "Potente",
    category: "Feminina",
    style: "powerful",
    voiceId: voiceScotland.voice_id,
    speedOffset: 15,
    pitchOffset: 4,
  },
  {
    id: "female-dramatic",
    label: "Dramática",
    category: "Feminina",
    style: "dramatic",
    voiceId: voiceReceivedPronunciation.voice_id,
    pitchOffset: -4,
    variant: "f4",
  },
  {
    id: "female-narrative",
    label: "Narrativa",
    category: "Feminina",
    style: "narrative",
    voiceId: voiceUS.voice_id,
    speedOffset: -5,
    variant: "f3",
  },
];

const EMOTIONS: EmotionOption[] = [
  { id: "neutral", label: "Neutro", pitchDelta: 0, speedDelta: 0, amplitudeDelta: 0 },
  { id: "happy", label: "Feliz", pitchDelta: 6, speedDelta: 12, amplitudeDelta: 8 },
  { id: "sad", label: "Triste", pitchDelta: -8, speedDelta: -20, amplitudeDelta: -12 },
  { id: "intense", label: "Intenso", pitchDelta: 4, speedDelta: 10, amplitudeDelta: 15 },
  { id: "mysterious", label: "Misterioso", pitchDelta: -6, speedDelta: -5, amplitudeDelta: -5 },
  { id: "epic", label: "Épico", pitchDelta: 8, speedDelta: 18, amplitudeDelta: 18 },
];

const MAX_CHARACTERS = 100_000;
const DEFAULT_SPEED = 1;
const DEFAULT_PITCH = 0;
const MP3_BITRATE = 320;

const loadedVoices = [
  voiceNeutral,
  voiceUS,
  voiceWestMidlands,
  voiceReceivedPronunciation,
  voiceScotland,
  voiceNorthern,
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function TextToSpeechModule({ onAudioReady }: TextToSpeechModuleProps) {
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>(VOICE_LIBRARY[0].id);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [pitch, setPitch] = useState<number>(DEFAULT_PITCH);
  const [emotion, setEmotion] = useState<EmotionId>("neutral");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [stats, setStats] = useState<{ words: number; sentences: number }>({
    words: 0,
    sentences: 0,
  });

  const previousUrlRef = useRef<string | null>(null);
  const engineReadyRef = useRef<Promise<void> | null>(null);
  const meSpeakRef = useRef<MeSpeak | null>(null);
  const engineInitializedRef = useRef(false);

  const selectedVoice = useMemo(
    () => VOICE_LIBRARY.find((option) => option.id === voiceId) ?? VOICE_LIBRARY[0],
    [voiceId]
  );

  const selectedEmotion = useMemo(
    () => EMOTIONS.find((item) => item.id === emotion) ?? EMOTIONS[0],
    [emotion]
  );

  const initializeEngine = useCallback(() => {
    if (engineReadyRef.current) {
      return engineReadyRef.current;
    }

    engineReadyRef.current = (async () => {
      if (typeof window === "undefined") {
        return;
      }
      if (!meSpeakRef.current) {
        const mespeakModule = await import("mespeak");
        meSpeakRef.current = mespeakModule.default;
      }
      const engine = meSpeakRef.current;
      if (!engine) {
        throw new Error("Engine não encontrado.");
      }
      if (!engineInitializedRef.current) {
        engine.loadConfig(config);
        loadedVoices.forEach((voice) => engine.loadVoice(voice));
        engineInitializedRef.current = true;
      }
      await wait(10);
    })();

    return engineReadyRef.current;
  }, []);

  useEffect(() => {
    initializeEngine().catch(() => {
      setError("Falha ao inicializar o mecanismo de voz.");
    });
  }, [initializeEngine]);

  useEffect(() => {
    return () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const words = text.trim().length
      ? text
          .trim()
          .split(/\s+/)
          .filter(Boolean).length
      : 0;
    const sentences = text.trim().length
      ? text.split(/[.!?]+/).filter((chunk) => chunk.trim().length).length
      : 0;
    setStats({ words, sentences });
  }, [text]);

  const handleTextChange = (value: string) => {
    if (value.length > MAX_CHARACTERS) {
      setText(value.slice(0, MAX_CHARACTERS));
      return;
    }
    setText(value);
  };

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      setError("Insira um texto para realizar a conversão.");
      return;
    }
    if (text.length > MAX_CHARACTERS) {
      setError("O texto excede o limite de 100.000 caracteres.");
      return;
    }

    await initializeEngine();
    setError(null);
    setIsProcessing(true);
    setProgress(3);

    let syntheticProgress = 3;
    const progressHandle = window.setInterval(() => {
      syntheticProgress = Math.min(95, syntheticProgress + Math.random() * 6);
      setProgress(syntheticProgress);
    }, 350);

    try {
      const engine = meSpeakRef.current;
      if (!engine) {
        throw new Error("Motor de síntese indisponível.");
      }
      const synthesis = await synthesizeToMp3({
        text,
        voice: selectedVoice,
        speed,
        pitch,
        emotion: selectedEmotion,
        engine,
      });

      const { blob, duration } = synthesis;
      const url = URL.createObjectURL(blob);
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }
      previousUrlRef.current = url;
      setAudioUrl(url);
      const fileName = `voz-premium-${new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14)}.mp3`;
      setAudioFileName(fileName);
      setAudioDuration(duration);
      setProgress(100);

      await wait(500);
      setIsProcessing(false);

      onAudioReady?.({
        url,
        fileName,
        blob,
        duration,
      });
    } catch (err) {
      console.error(err);
      setError("Não foi possível concluir a síntese de voz.");
      setIsProcessing(false);
    } finally {
      window.clearInterval(progressHandle);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-100">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
          Módulo 1
        </span>
        <h2 className="text-2xl font-semibold text-slate-900">
          Conversão Texto para Áudio
        </h2>
        <p className="text-sm text-slate-500">
          Converta roteiros extensos em narrações profissionais com controle total
          de timbre, emoção e dinâmica.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Texto base</span>
              <span>
                {text.length.toLocaleString("pt-BR")} /{" "}
                {MAX_CHARACTERS.toLocaleString("pt-BR")} caracteres
              </span>
            </div>
            <textarea
              className="mt-2 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(79,70,229,0.1)]"
              placeholder="Cole ou escreva o script do seu áudio (até 100.000 caracteres)."
              value={text}
              onChange={(event) => handleTextChange(event.target.value)}
            />
            <dl className="mt-2 flex gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <dd>{stats.words} palavras</dd>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <dd>{stats.sentences} sentenças</dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Biblioteca de vozes premium
              </h3>
              <p className="text-xs text-slate-500">
                Escolha vozes masculinas ou femininas com estilos dedicados a storytelling,
                anúncios ou conteúdos técnicos.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {VOICE_LIBRARY.map((option) => {
                const isActive = option.id === voiceId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVoiceId(option.id)}
                    className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-indigo-500 bg-white shadow-[0_20px_40px_rgba(79,70,229,0.15)]"
                        : "border-transparent bg-white/70 hover:border-indigo-200 hover:bg-white"
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-500">
                      {option.category}
                    </span>
                    <span className="text-base font-semibold text-slate-800">
                      {option.label}
                    </span>
                    <span className="text-xs text-slate-500 capitalize">
                      {option.style}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Controles de síntese de voz
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ControlGroup
                title="Velocidade"
                description="Defina o ritmo de fala."
              >
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  className="w-full accent-indigo-500"
                />
                <span className="text-xs font-medium text-slate-600">
                  {speed.toFixed(2)}x
                </span>
              </ControlGroup>
              <ControlGroup title="Pitch/Tom" description="Ajuste graves e agudos.">
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={pitch}
                  onChange={(event) => setPitch(Number(event.target.value))}
                  className="w-full accent-indigo-500"
                />
                <span className="text-xs font-medium text-slate-600">{pitch}</span>
              </ControlGroup>
              <ControlGroup title="Emoção" description="Atmosfera interpretativa.">
                <select
                  value={emotion}
                  onChange={(event) => setEmotion(event.target.value as EmotionId)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 outline-none transition focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(79,70,229,0.18)]"
                >
                  {EMOTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </ControlGroup>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white">
            <div>
              <h3 className="text-lg font-semibold">Exportação em MP3 320kbps</h3>
              <p className="text-sm text-indigo-50/90">
                Renderização de qualidade broadcast com encapsulamento otimizado
                para edição em qualquer DAW.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAudio}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 rounded-full bg-white/15 px-6 py-3 text-sm font-semibold shadow-lg shadow-indigo-900/40 transition hover:bg-white/25 disabled:cursor-not-allowed disabled:bg-white/10"
            >
              {isProcessing ? "Processando..." : "Converter para áudio"}
            </button>
            {isProcessing ? (
              <ProgressBar value={progress} label="Progresso" className="mt-1" />
            ) : null}
            {error ? (
              <p className="text-xs font-medium text-red-100">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <h3 className="text-sm font-semibold text-indigo-900">
            Pré-visualização e exportação
          </h3>

          {audioUrl ? (
            <>
              <audio
                controls
                src={audioUrl}
                className="w-full rounded-xl border border-indigo-100 bg-white p-2"
              />
              <dl className="grid gap-2 text-xs text-indigo-900/80">
                <div className="flex items-center justify-between">
                  <dt>Nome</dt>
                  <dd className="font-semibold">{audioFileName}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Duração</dt>
                  <dd className="font-semibold">
                    {audioDuration ? formatDuration(audioDuration) : "-"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Qualidade</dt>
                  <dd className="font-semibold">MP3 · 320kbps</dd>
                </div>
              </dl>
              <a
                download={audioFileName ?? "voz-premium.mp3"}
                href={audioUrl}
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-400/40 transition hover:bg-indigo-500"
              >
                Baixar arquivo MP3
              </a>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white/60 p-6 text-center">
              <p className="text-sm font-medium text-indigo-900">Nenhum áudio gerado</p>
              <p className="mt-1 text-xs text-indigo-700">
                Após a conversão, o player e o download aparecerão aqui.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-indigo-100 bg-white/70 p-4 text-[11px] text-indigo-900/80">
            <p className="font-semibold uppercase tracking-[0.25em] text-indigo-500">
              Pipeline assíncrono
            </p>
            <ul className="mt-2 space-y-1">
              <li>· Síntese multi-região com otimização de timbragem</li>
              <li>· Normalização inteligente em -1 dBTP</li>
              <li>· Exportador LAME em 44.1kHz / 320kbps</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

type ControlGroupProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

function ControlGroup({ title, description, children }: ControlGroupProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-slate-50 p-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {title}
        </h4>
        <p className="text-[10px] text-slate-400">{description}</p>
      </div>
      {children}
    </div>
  );
}

type SynthesisInput = {
  text: string;
  voice: VoiceOption;
  speed: number;
  pitch: number;
  emotion: EmotionOption;
  engine: MeSpeak;
};

type SynthesisResult = {
  blob: Blob;
  duration: number;
};

async function synthesizeToMp3({
  text,
  voice,
  speed,
  pitch,
  emotion,
  engine,
}: SynthesisInput): Promise<SynthesisResult> {
  const normalized = normalizeOptions({
    voice,
    speed,
    pitch,
    emotion,
  });

  const synthesisBuffer = await new Promise<number[] | null>((resolve, reject) => {
    const execute = () => {
      try {
        const options = {
          rawdata: "array" as const,
          voice: normalized.voiceId,
          variant: normalized.variant,
          speed: normalized.speed,
          pitch: normalized.pitch,
          amplitude: normalized.amplitude,
        };

        const parts = splitIntoChunks(text);
        let output: number[] | null;
        if (parts.length > 1) {
          output = engine.speakMultipart(
            parts.map((chunk) => ({ text: chunk })),
            options
          ) as number[] | null;
        } else {
          output = engine.speak(text, options) as number[] | null;
        }
        resolve(output);
      } catch (error) {
        reject(error);
      }
    };

    window.setTimeout(execute, 16);
  });

  if (!synthesisBuffer) {
    throw new Error("Síntese não retornou dados válidos.");
  }

  const arrayBuffer = toArrayBuffer(synthesisBuffer);
  const { blob, duration } = await convertWavToMp3(arrayBuffer, MP3_BITRATE);

  return { blob, duration };
}

function normalizeOptions({
  voice,
  speed,
  pitch,
  emotion,
}: {
  voice: VoiceOption;
  speed: number;
  pitch: number;
  emotion: EmotionOption;
}) {
  const baseSpeed = 175;
  const basePitch = 50;
  const amplitude = 100 + (emotion.amplitudeDelta ?? 0);

  const resolvedSpeed = clamp(
    80,
    360,
    Math.round(
      baseSpeed * speed +
        (voice.speedOffset ?? 0) +
        (emotion.speedDelta ?? 0)
    )
  );

  const resolvedPitch = clamp(
    1,
    99,
    Math.round(
      basePitch +
        (pitch * 2) +
        (voice.pitchOffset ?? 0) +
        (emotion.pitchDelta ?? 0)
    )
  );

  return {
    voiceId: voice.voiceId,
    variant: voice.variant,
    speed: resolvedSpeed,
    pitch: resolvedPitch,
    amplitude: clamp(10, 200, amplitude),
  };
}

function clamp(min: number, max: number, value: number) {
  return Math.min(max, Math.max(min, value));
}

function splitIntoChunks(text: string) {
  if (text.length <= 4000) {
    return [text];
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g);
  if (!sentences) {
    return chunkByLength(text, 3000);
  }

  const chunks: string[] = [];
  let buffer = "";

  sentences.forEach((sentence) => {
    if ((buffer + sentence).length > 4000) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  });

  if (buffer.trim().length) {
    chunks.push(buffer);
  }

  return chunks.filter((chunk) => chunk.trim().length);
}

function chunkByLength(text: string, maxLength: number) {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + maxLength));
    index += maxLength;
  }
  return chunks;
}

function toArrayBuffer(data: number[] | ArrayBuffer) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (Array.isArray(data)) {
    const buffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(buffer);
    view.set(data);
    return buffer;
  }
  throw new Error("Formato de áudio não reconhecido.");
}

async function convertWavToMp3(arrayBuffer: ArrayBuffer, bitrate: number) {
  const view = new DataView(arrayBuffer);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  if (bitsPerSample !== 16) {
    throw new Error("Somente amostras PCM 16-bit são suportadas.");
  }

  const pcmDataOffset = 44;
  const samples = new Int16Array(
    arrayBuffer,
    pcmDataOffset,
    (arrayBuffer.byteLength - pcmDataOffset) / 2
  );

  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);
  const sampleBlockSize = 1152;
  const mp3Chunks: number[] = [];

  if (channels === 1) {
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = encoder.encodeBuffer(sampleChunk);
      appendChunk(mp3Chunks, mp3buf);
    }
  } else if (channels === 2) {
    const left = new Int16Array(samples.length / 2);
    const right = new Int16Array(samples.length / 2);
    for (let i = 0, j = 0; i < samples.length; i += 2, j++) {
      left[j] = samples[i];
      right[j] = samples[i + 1];
    }
    for (let i = 0; i < left.length; i += sampleBlockSize) {
      const leftChunk = left.subarray(i, i + sampleBlockSize);
      const rightChunk = right.subarray(i, i + sampleBlockSize);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      appendChunk(mp3Chunks, mp3buf);
    }
  } else {
    throw new Error("Somente áudio mono ou estéreo é suportado.");
  }

  const endBuffer = encoder.flush();
  appendChunk(mp3Chunks, endBuffer);

  const mp3Blob = new Blob([new Uint8Array(mp3Chunks)], { type: "audio/mpeg" });

  const dataLength = view.getUint32(40, true);
  const duration = dataLength / (sampleRate * channels * (bitsPerSample / 8));

  return { blob: mp3Blob, duration };
}

function appendChunk(target: number[], chunk: Int8Array | Uint8Array | number[]) {
  if (!chunk) {
    return;
  }
  if (Array.isArray(chunk)) {
    target.push(...chunk);
    return;
  }
  target.push(...Array.from(chunk));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
}
