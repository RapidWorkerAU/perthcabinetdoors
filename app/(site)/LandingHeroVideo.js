"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_ID = "kDDYLVK1YHw";
const FADE_SECONDS = 1.4;

export default function LandingHeroVideo() {
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const transitionRef = useRef(false);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    let mounted = true;

    function restartWithFade(player) {
      if (transitionRef.current) return;
      transitionRef.current = true;
      setIsFading(true);

      fadeTimeoutRef.current = window.setTimeout(() => {
        if (!mounted) return;
        player.seekTo(0, true);
        player.playVideo();
        setIsFading(false);
        transitionRef.current = false;
      }, FADE_SECONDS * 1000);
    }

    function startLoopWatcher(player) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }

      pollRef.current = window.setInterval(() => {
        if (!player || typeof player.getDuration !== "function" || typeof player.getCurrentTime !== "function") {
          return;
        }

        const duration = player.getDuration();
        const currentTime = player.getCurrentTime();

        if (!duration || currentTime < duration - FADE_SECONDS) {
          return;
        }

        restartWithFade(player);
      }, 250);
    }

    function createPlayer() {
      if (!mounted || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player("landingHeroVideo", {
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          mute: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            event.target.mute();
            event.target.playVideo();
            startLoopWatcher(event.target);
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              restartWithFade(event.target);
            }
          },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      window.onYouTubeIframeAPIReady = createPlayer;

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      mounted = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className={`landing-video-shell ${isFading ? "is-fading" : ""}`} aria-hidden="true">
      <div id="landingHeroVideo" />
    </div>
  );
}
