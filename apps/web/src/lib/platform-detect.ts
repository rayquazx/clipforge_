export interface PlatformDetectionResult {
  isValid: boolean;
  platform: "twitch" | "youtube" | "kick" | null;
  error?: string;
}

export function detectPlatformFromUrl(url: string): PlatformDetectionResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { isValid: false, platform: null };
  }

  // YouTube: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...
  if (
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?.*v=|shorts\/)|youtu\.be\/)/i.test(
      trimmed
    )
  ) {
    return { isValid: true, platform: "youtube" };
  }

  // Twitch: twitch.tv/videos/..., twitch.tv/.../clip/...
  if (
    /^(https?:\/\/)?(www\.)?(twitch\.tv\/(videos\/\d+|[^/]+\/clip\/[a-zA-Z0-9_-]+|[^/]+))/i.test(
      trimmed
    )
  ) {
    return { isValid: true, platform: "twitch" };
  }

  // Kick: kick.com/video/..., kick.com/.../videos/...
  if (
    /^(https?:\/\/)?(www\.)?kick\.com\/([a-zA-Z0-9_-]+\/videos\/|video\/|[a-zA-Z0-9_-]+)/i.test(
      trimmed
    )
  ) {
    return { isValid: true, platform: "kick" };
  }

  return {
    isValid: false,
    platform: null,
    error: "Unsupported stream platform. Please provide a YouTube, Twitch VOD, or Kick VOD URL.",
  };
}
