"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import { GeneratedAudio } from "@/components/tts/TextToSpeechModule";

type VideoComposerProps = {
  audio?: GeneratedAudio | null;
};

type MediaItem = {
  id: string;
  name: string;
  url: string;
  type: "image" | "video";
  file: File;
  sizeLabel: string;
  createdAt: number;
};

type TransitionType = "cut" | "fade" | "slide" | "zoom" | "wipe";

type TimelineClip = {
  id: string;
  mediaId: string;
  duration: number;
  transition: TransitionType;
};

const transitionLabels: Record<TransitionType, string> = {
  cut: "Corte Seco",
  fade: "Crossfade",
  slide: "Slide Horizontal",
  zoom: "Zoom Progressivo",
  wipe: "Wipe Vertical",
};

const ACCEPTED_FORMATS = {
  "image/png": [],
  "image/jpeg": [],
  "image/webp": [],
  "video/mp4": [],
  "video/webm": [],
};

const MAX_FILE_SIZE_MB = 200;

export function VideoComposer({ audio }: VideoComposerProps) {
  const [mode, setMode] = useState<"simple" | "advanced">("advanced");
  const [mediaLibrary, setMediaLibrary] = useState<MediaItem[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [activeClipIndex, setActiveClipIndex] = useState<number>(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const timeoutsRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const totalTimelineDuration = useMemo(
    () => timeline.reduce((acc, clip) => acc + clip.duration, 0),
    [timeline]
  );

  const timelineWithMedia = useMemo(() => {
    return timeline
      .map((clip) => {
        const media = mediaLibrary.find((item) => item.id === clip.mediaId);
        return media ? { clip, media } : null;
      })
      .filter((item): item is { clip: TimelineClip; media: MediaItem } => !!item);
  }, [timeline, mediaLibrary]);

  useEffect(() => {
    return () => {
      mediaLibrary.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [mediaLibrary]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const nextItems: MediaItem[] = acceptedFiles
      .filter((file) => {
        const sizeMb = file.size / (1024 * 1024);
        return sizeMb <= MAX_FILE_SIZE_MB;
      })
      .map((file) => {
        const id = crypto.randomUUID();
        const sizeLabel = formatBytes(file.size);
        return {
          id,
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type.startsWith("video") ? "video" : "image",
          file,
          sizeLabel,
          createdAt: Date.now(),
        } satisfies MediaItem;
      });

    if (!nextItems.length) {
      return;
    }

    setMediaLibrary((prev) => [...prev, ...nextItems]);
    setSelectedMediaId(nextItems[0].id);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_FORMATS,
    multiple: true,
    maxFiles: 50,
    onDrop,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  const handleAddClip = (mediaId: string) => {
    setTimeline((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        mediaId,
        duration: Math.max(5, Math.round(audio?.duration ?? 8)),
        transition: "fade",
      },
    ]);
  };

  const handleRemoveClip = (clipId: string) => {
    setTimeline((prev) => {
      const updated = prev.filter((clip) => clip.id !== clipId);
      if (updated.length !== prev.length) {
        if (updated.length === 0) {
          setIsPreviewing(false);
          setPreviewProgress(0);
          setActiveClipIndex(0);
        } else {
          setActiveClipIndex((current) => Math.min(current, updated.length - 1));
        }
      }
      return updated;
    });
  };

  const handleDurationChange = (clipId: string, duration: number) => {
    setTimeline((prev) =>
      prev.map((clip) =>
        clip.id === clipId ? { ...clip, duration: clamp(1, 120, duration) } : clip
      )
    );
  };

  const handleTransitionChange = (clipId: string, transition: TransitionType) => {
    setTimeline((prev) =>
      prev.map((clip) =>
        clip.id === clipId ? { ...clip, transition } : clip
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setTimeline((prev) => {
      const oldIndex = prev.findIndex((clip) => clip.id === active.id);
      const newIndex = prev.findIndex((clip) => clip.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleModeApply = () => {
    if (mode !== "simple") {
      return;
    }
    if (!selectedMediaId) {
      return;
    }
    const duration = Math.max(10, Math.round(audio?.duration ?? 60));
    setTimeline([
      {
        id: crypto.randomUUID(),
        mediaId: selectedMediaId,
        duration,
        transition: "fade",
      },
    ]);
  };

  const handleRemoveMedia = (mediaId: string) => {
    setMediaLibrary((prev) => {
      const item = prev.find((media) => media.id === mediaId);
      if (item) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((media) => media.id !== mediaId);
    });
    setTimeline((prev) => {
      const updated = prev.filter((clip) => clip.mediaId !== mediaId);
      if (updated.length !== prev.length) {
        if (updated.length === 0) {
          setIsPreviewing(false);
          setPreviewProgress(0);
          setActiveClipIndex(0);
        } else {
          setActiveClipIndex((current) => Math.min(current, updated.length - 1));
        }
      }
      return updated;
    });
    if (selectedMediaId === mediaId) {
      setSelectedMediaId(null);
    }
  };

  const togglePreview = () => {
    if (!timelineWithMedia.length) {
      return;
    }
    setIsPreviewing((prev) => {
      if (prev) {
        setPreviewProgress(0);
      } else {
        setPreviewProgress(0);
      }
      return !prev;
    });
  };

  useEffect(() => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current = [];
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!isPreviewing) {
      return;
    }
    if (!timelineWithMedia.length) {
      return;
    }

    const totalDurationMs = totalTimelineDuration * 1000;
    const startedAt = performance.now();

    const scheduleClip = (index: number) => {
      setActiveClipIndex(index);
      const clip = timelineWithMedia[index];
      const clipDurationMs = clip.clip.duration * 1000;
      const timeoutId = window.setTimeout(() => {
        if (index + 1 < timelineWithMedia.length) {
          scheduleClip(index + 1);
        } else {
          setIsPreviewing(false);
          setPreviewProgress(100);
          window.setTimeout(() => {
            setPreviewProgress(0);
          }, 300);
        }
      }, clipDurationMs);
      timeoutsRef.current.push(timeoutId);
    };

    scheduleClip(0);

    const animate = () => {
      const elapsed = performance.now() - startedAt;
      const progress = (elapsed / totalDurationMs) * 100;
      setPreviewProgress(clamp(0, 100, progress));
      if (isPreviewing) {
        rafRef.current = window.requestAnimationFrame(animate);
      }
    };
    rafRef.current = window.requestAnimationFrame(animate);

    return () => {
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutsRef.current = [];
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPreviewing, timelineWithMedia, totalTimelineDuration]);

  useEffect(() => {
    timelineWithMedia.forEach(({ clip }) => {
      const video = videoRefs.current[clip.id];
      if (!video) {
        return;
      }
      const isActive = timeline[activeClipIndex]?.id === clip.id;
      if (isActive && isPreviewing) {
        video.currentTime = 0;
        void video.play();
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [activeClipIndex, timelineWithMedia, isPreviewing, timeline]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-100">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Módulo 2
        </span>
        <h2 className="text-2xl font-semibold text-slate-900">
          Video Composer · Editor Visual
        </h2>
        <p className="text-sm text-slate-500">
          Estruture timelines híbridas com imagens e vídeos, arraste elementos na
          linha do tempo e crie composições cinematográficas em minutos.
        </p>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Biblioteca de mídia
                </h3>
                <p className="text-xs text-slate-500">
                  Faça upload de imagens (JPG, PNG, WebP) e vídeos (MP4, WebM).
                </p>
              </div>
              <div className="flex gap-2 text-xs font-medium text-slate-500">
                <span>{mediaLibrary.length} itens</span>
              </div>
            </div>
            <div
              {...getRootProps()}
              className={`mt-4 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center transition ${
                isDragActive ? "border-indigo-500 bg-indigo-50" : "hover:border-indigo-300"
              }`}
            >
              <input {...getInputProps()} />
              <p className="text-sm font-semibold text-slate-700">
                Arraste arquivos ou clique para buscar
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Suporte a múltiplos arquivos · até {MAX_FILE_SIZE_MB}MB por item
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {mediaLibrary.map((item) => {
                const isActive = item.id === selectedMediaId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedMediaId(item.id)}
                    className={`group flex flex-col gap-2 rounded-xl border p-3 text-left transition ${
                      isActive
                        ? "border-indigo-500 bg-white shadow-[0_18px_30px_rgba(99,102,241,0.18)]"
                        : "border-transparent bg-white/80 hover:border-indigo-200 hover:bg-white"
                    }`}
                  >
                    <div className="relative h-32 overflow-hidden rounded-lg bg-slate-200">
                      {item.type === "image" ? (
                        <Image
                          src={item.url}
                          alt={item.name}
                          fill
                          unoptimized
                          sizes="(max-width: 1024px) 50vw, 200px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <video
                          src={item.url}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          muted
                        />
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                        {item.type === "image" ? "IMG" : "VID"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="line-clamp-2 text-xs font-semibold text-slate-700">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-500">{item.sizeLabel}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveMedia(item.id);
                        }}
                        className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-500 transition hover:bg-red-100"
                      >
                        Remover
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAddClip(item.id);
                      }}
                      className="flex items-center justify-center rounded-lg border border-indigo-200 bg-white px-2 py-2 text-[11px] font-semibold text-indigo-600 transition hover:border-indigo-400 hover:text-indigo-700"
                    >
                      Adicionar à timeline
                    </button>
                  </button>
                );
              })}
              {!mediaLibrary.length ? (
                <div className="col-span-full rounded-xl border border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-600">
                  Adicione itens à biblioteca para começar a compor sua história visual.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Timeline e transições
                </h3>
                <p className="text-xs text-slate-500">
                  Arraste e solte para reordenar, ajuste a duração e escolha transições.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setMode("simple")}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === "simple" ? "bg-indigo-600 text-white shadow" : ""
                  }`}
                >
                  Modo Simples
                </button>
                <button
                  type="button"
                  onClick={() => setMode("advanced")}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === "advanced" ? "bg-indigo-600 text-white shadow" : ""
                  }`}
                >
                  Modo Avançado
                </button>
              </div>
            </div>

            {mode === "simple" ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-900">
                <p className="font-semibold uppercase tracking-[0.2em] text-indigo-500">
                  Modo simples
                </p>
                <p className="mt-1 text-indigo-900/80">
                  Selecione uma imagem da biblioteca e aplique-a em todo o áudio com
                  um clique.
                </p>
                <button
                  type="button"
                  onClick={handleModeApply}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-[11px] font-semibold text-white shadow-lg shadow-indigo-400/40 transition hover:bg-indigo-500"
                >
                  Aplicar imagem ao longo do áudio
                </button>
              </div>
            ) : null}

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={timeline.map((clip) => clip.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex min-h-[160px] flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  {timelineWithMedia.map(({ clip, media }, index) => (
                    <SortableClipCard
                      key={clip.id}
                      clip={clip}
                      media={media}
                      index={index}
                      active={timeline[activeClipIndex]?.id === clip.id && isPreviewing}
                      onDurationChange={handleDurationChange}
                      onTransitionChange={handleTransitionChange}
                      onRemove={handleRemoveClip}
                    />
                  ))}
                  {!timelineWithMedia.length ? (
                    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
                      Arraste itens da biblioteca ou clique em &ldquo;Adicionar à timeline&rdquo;
                      para iniciar sua composição.
                    </div>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span>
                Duração total:{" "}
                <strong className="font-semibold text-slate-800">
                  {formatDuration(totalTimelineDuration)}
                </strong>
              </span>
              <span>
                Clipes:{" "}
                <strong className="font-semibold text-slate-800">
                  {timelineWithMedia.length}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Visualização dinâmica
              </h3>
              <p className="text-xs text-slate-500">
                Preview com transições aplicadas em tempo real.
              </p>
            </div>
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                isPreviewing
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-400/40 hover:bg-rose-500"
                  : "bg-indigo-600 text-white shadow-lg shadow-indigo-400/40 hover:bg-indigo-500"
              }`}
              onClick={togglePreview}
              disabled={!timelineWithMedia.length}
            >
              {isPreviewing ? "Parar prévia" : "Pré-visualizar"}
            </button>
          </div>

          <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 bg-black">
            {timelineWithMedia.map(({ clip, media }) => {
              const isActive = timeline[activeClipIndex]?.id === clip.id;
              return media.type === "image" ? (
                <Image
                  key={clip.id}
                  src={media.url}
                  alt={media.name}
                  fill
                  unoptimized
                  sizes="(min-width: 1024px) 600px, 80vw"
                  className={`object-cover transition-all duration-700 ease-out ${isActive ? transitionClass(clip.transition, true) : "opacity-0 scale-105"}`}
                  style={{ zIndex: isActive ? 20 : 10 }}
                />
              ) : (
                <video
                  key={clip.id}
                  ref={(element) => {
                    videoRefs.current[clip.id] = element;
                  }}
                  src={media.url}
                  muted
                  className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out ${isActive ? transitionClass(clip.transition, true) : "opacity-0 scale-105"}`}
                  style={{ zIndex: isActive ? 20 : 10 }}
                />
              );
            })}
            {!timelineWithMedia.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-200">
                <span className="text-lg font-semibold">Pré-visualização</span>
                <span>Adicione clipes na timeline para iniciar o preview.</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-full bg-white p-2">
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-200 ease-linear"
                style={{ width: `${previewProgress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-slate-500">
              <span>Início</span>
              <span>{previewProgress.toFixed(0)}%</span>
              <span>Fim</span>
            </div>
          </div>

  

          {audio ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <p className="text-sm font-semibold text-slate-800">Trilha atual</p>
              <p className="mt-1 font-semibold text-slate-700">{audio.fileName}</p>
              <p className="mt-1">
                Duração:{" "}
                <strong className="text-slate-800">
                  {formatDuration(audio.duration)}
                </strong>
              </p>
              <audio controls src={audio.url} className="mt-3 w-full" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-500">
              Gere um áudio no módulo de síntese para sincronizar a timeline.
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[11px] text-slate-600">
            <p className="font-semibold uppercase tracking-[0.2em] text-slate-500">
              Recursos do editor
            </p>
            <ul className="mt-2 space-y-1">
              <li>· Timeline drag-and-drop com snapping inteligente</li>
              <li>· Transições personalizadas por clipe</li>
              <li>· Sincronização com trilhas de áudio externas</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

type SortableClipCardProps = {
  clip: TimelineClip;
  media: MediaItem;
  index: number;
  active: boolean;
  onDurationChange: (clipId: string, duration: number) => void;
  onTransitionChange: (clipId: string, transition: TransitionType) => void;
  onRemove: (clipId: string) => void;
};

function SortableClipCard({
  clip,
  media,
  index,
  active,
  onDurationChange,
  onTransitionChange,
  onRemove,
}: SortableClipCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: clip.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-full max-w-[240px] flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
        active ? "shadow-[0_0_0_3px_rgba(99,102,241,0.3)]" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>Clip {index + 1}</span>
        <span>{media.type === "image" ? "Imagem" : "Vídeo"}</span>
      </div>
      <div className="relative h-28 overflow-hidden rounded-lg bg-slate-200">
        {media.type === "image" ? (
          <Image
            src={media.url}
            alt={media.name}
            fill
            unoptimized
            sizes="200px"
            className="object-cover"
          />
        ) : (
          <video src={media.url} muted className="h-full w-full object-cover" />
        )}
        {active ? (
          <span className="absolute inset-0 border-2 border-indigo-500/60" />
        ) : null}
      </div>
      <div className="flex flex-col gap-2 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-700">Duração (s)</span>
          <input
            type="range"
            min={1}
            max={120}
            step={1}
            value={clip.duration}
            onChange={(event) => onDurationChange(clip.id, Number(event.target.value))}
            className="accent-indigo-500"
          />
          <span className="text-[11px] font-semibold text-slate-500">
            {clip.duration}s
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-700">Transição</span>
          <select
            value={clip.transition}
            onChange={(event) =>
              onTransitionChange(clip.id, event.target.value as TransitionType)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 outline-none transition focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.2)]"
          >
            {Object.entries(transitionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="line-clamp-1 font-semibold">{media.name}</span>
        <button
          type="button"
          onClick={() => onRemove(clip.id)}
          className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-500 transition hover:bg-red-100"
        >
          Remover
        </button>
      </div>
    </div>
  );
}

function clamp(min: number, max: number, value: number) {
  return Math.min(max, Math.max(min, value));
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
  if (!Number.isFinite(seconds)) {
    return "-";
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function transitionClass(transition: TransitionType, isActive: boolean) {
  if (!isActive) {
    return "opacity-0 scale-105";
  }
  switch (transition) {
    case "cut":
      return "opacity-100 scale-100";
    case "fade":
      return "opacity-100 scale-100";
    case "slide":
      return "opacity-100 scale-100 translate-x-0 animate-slide-in";
    case "zoom":
      return "opacity-100 scale-100 animate-zoom-in";
    case "wipe":
      return "opacity-100 scale-100 animate-wipe-in";
    default:
      return "opacity-100 scale-100";
  }
}
