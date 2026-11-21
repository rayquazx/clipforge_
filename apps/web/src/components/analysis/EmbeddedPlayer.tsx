"use client";

import * as React from "react";
import { Play, ExternalLink } from "lucide-react";
import { Project } from "@/types";

interface EmbeddedPlayerProps {
  project: Project;
  seekTime: number;
  autoPlay?: boolean;
}

export function EmbeddedPlayer({ project, seekTime, autoPlay = true }: EmbeddedPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // When seekTime changes, update the player
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      if (autoPlay) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [seekTime, autoPlay]);

  const floorTime = Math.max(0, Math.floor(seekTime));

  // 1. YouTube Player
  if (project.source_type === "youtube" && project.external_id) {
    const embedUrl = `https://www.youtube.com/embed/${project.external_id}?start=${floorTime}&autoplay=${autoPlay ? 1 : 0}&enablejsapi=1`;

    return (
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-border shadow-2xl">
        <iframe
          ref={iframeRef}
          key={`yt-${project.external_id}-${floorTime}`}
          src={embedUrl}
          title={project.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  // 2. Twitch VOD Player
  if (project.source_type === "twitch" && project.external_id) {
    const twitchTime = `${Math.floor(floorTime / 3600)}h${Math.floor((floorTime % 3600) / 60)}m${floorTime % 60}s`;
    const twitchUrl = `https://player.twitch.tv/?video=${project.external_id}&parent=localhost&time=${twitchTime}&autoplay=${autoPlay}`;

    return (
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-border shadow-2xl">
        <iframe
          key={`twitch-${project.external_id}-${floorTime}`}
          src={twitchUrl}
          title={project.title}
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  // 3. Direct Upload Player (MinIO)
  if (project.source_type === "upload" && project.thumbnail_url) {
    // If raw video has presigned URL or streaming endpoint
    const videoSrc = project.thumbnail_url; // or MinIO stream URL

    return (
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-border shadow-2xl">
        <video
          ref={videoRef}
          controls
          src={videoSrc}
          className="w-full h-full object-contain"
        >
          Your browser does not support HTML5 video playback.
        </video>
      </div>
    );
  }

  // 4. Kick or Fallback Player
  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-surface-hover border border-border flex flex-col items-center justify-center p-6 text-center space-y-3">
      {project.thumbnail_url && (
        <img
          src={project.thumbnail_url}
          alt={project.title}
          className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-sm"
        />
      )}
      <div className="relative z-10 w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
        <Play className="w-6 h-6 ml-0.5" />
      </div>
      <div className="relative z-10 space-y-1">
        <h4 className="text-sm font-semibold text-text-primary">
          Preview for {project.source_type.toUpperCase()} VOD
        </h4>
        <p className="text-xs text-text-secondary max-w-sm">
          Jump to timestamp {floorTime}s on the platform stream:
        </p>
      </div>
      {project.source_url && (
        <a
          href={`${project.source_url}?t=${floorTime}`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all"
        >
          <span>Open at {floorTime}s on {project.source_type}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
