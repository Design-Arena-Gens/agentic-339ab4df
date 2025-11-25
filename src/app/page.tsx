"use client";

import { useMemo, useState } from "react";
import { TextToSpeechModule, GeneratedAudio } from "@/components/tts/TextToSpeechModule";
import { VideoComposer } from "@/components/video/VideoComposer";

export default function Home() {
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(null);

  const stats = useMemo(() => {
    if (!generatedAudio) {
      return null;
    }
    return {
      duration: generatedAudio.duration,
      size: formatBytes(generatedAudio.blob.size),
    };
  }, [generatedAudio]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-16 sm:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-200">
                Suite Audiovisual
              </span>
              <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Plataforma integrada para produção audiovisual premium
              </h1>
              <p className="text-sm text-indigo-100/80 sm:text-base">
                Construa narrativas sonoras impressionantes, sincronize trilhas com
                composições visuais e entregue vídeos prontos para lançamento em escala
                com fluxo totalmente web.
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-indigo-100/70">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  Até 100k caracteres
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  MP3 320kbps
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  Timeline drag &amp; drop
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  Transições dedicadas
                </span>
              </div>
            </div>
            {stats ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-xs text-white">
                <p className="text-sm font-semibold text-indigo-100">Último render</p>
                <div className="flex items-center justify-between">
                  <span className="text-indigo-100/70">Duração</span>
                  <strong className="font-semibold text-white">
                    {formatDuration(stats.duration)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-indigo-100/70">Tamanho</span>
                  <strong className="font-semibold text-white">{stats.size}</strong>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <TextToSpeechModule
          onAudioReady={(audio) => {
            setGeneratedAudio(audio);
          }}
        />

        <VideoComposer audio={generatedAudio} />
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B";
  }
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const result = parseFloat((bytes / Math.pow(1024, i)).toFixed(2));
  return `${result} ${sizes[i]}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
}
