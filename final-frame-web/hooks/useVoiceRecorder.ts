"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_RECORDING_SECONDS = 5 * 60;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type VoiceRecorderStatus = "idle" | "requesting" | "recording" | "ready" | "error";

interface VoiceRecorderState {
  status: VoiceRecorderStatus;
  blob: Blob | null;
  previewUrl: string;
  mimeType: string;
  elapsedSeconds: number;
  error: string | null;
  transcript: string;
  interimTranscript: string;
  transcriptionSupported: boolean;
  transcriptionError: string | null;
  isSupported: boolean;
  start: (options?: { transcribe?: boolean }) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

function chooseMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef("");
  const finalTranscriptRef = useRef("");
  const recognitionShouldRunRef = useRef(false);
  const discardNextStopRef = useRef(false);
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const isSupported = useMemo(() => typeof window !== "undefined"
    && typeof MediaRecorder !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia), []);
  const transcriptionSupported = useMemo(() => Boolean(speechRecognitionConstructor()), []);

  const replacePreviewUrl = useCallback((nextUrl: string) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    if (mountedRef.current) setPreviewUrl(nextUrl);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    recognitionShouldRunRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      if (abort) recognition.abort();
      else recognition.stop();
    } catch {
      // Recognition may already have ended. Audio recording still remains valid.
    }
  }, []);

  const startRecognition = useCallback(() => {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionShouldRunRef.current = true;
    recognition.onresult = (event) => {
      let interim = "";
      let finalAddition = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const value = result?.[0]?.transcript?.trim() ?? "";
        if (!value) continue;
        if (result.isFinal) finalAddition += `${value} `;
        else interim += `${value} `;
      }

      if (finalAddition) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalAddition}`.trim();
        if (mountedRef.current) setTranscript(finalTranscriptRef.current);
      }
      if (mountedRef.current) setInterimTranscript(interim.trim());
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "";
      if (["aborted", "no-speech"].includes(code)) return;
      recognitionShouldRunRef.current = false;
      if (mountedRef.current) {
        setTranscriptionError("Live transcription stopped. The voice recording can still be attached and the transcript can be typed manually.");
      }
    };
    recognition.onend = () => {
      if (mountedRef.current) setInterimTranscript("");
      if (!recognitionShouldRunRef.current || recognitionRef.current !== recognition) return;
      window.setTimeout(() => {
        if (!recognitionShouldRunRef.current || recognitionRef.current !== recognition) return;
        try { recognition.start(); } catch { /* Browser recognition may still be settling. */ }
      }, 120);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionShouldRunRef.current = false;
      recognitionRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    stopRecognition(true);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      discardNextStopRef.current = true;
      recorder.stop();
    }
    recorderRef.current = null;
    releaseStream();
    chunksRef.current = [];
    finalTranscriptRef.current = "";
    replacePreviewUrl("");
    setBlob(null);
    setMimeType("");
    setElapsedSeconds(0);
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    setTranscriptionError(null);
    setStatus("idle");
  }, [clearTimer, releaseStream, replacePreviewUrl, stopRecognition]);

  const stop = useCallback(() => {
    clearTimer();
    stopRecognition(false);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, [clearTimer, stopRecognition]);

  const start = useCallback(async (options?: { transcribe?: boolean }) => {
    if (!isSupported || status === "recording" || status === "requesting") return;
    replacePreviewUrl("");
    finalTranscriptRef.current = "";
    setBlob(null);
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    setTranscriptionError(null);
    setElapsedSeconds(0);
    setStatus("requesting");
    discardNextStopRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const selectedMimeType = chooseMimeType();
      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType, audioBitsPerSecond: 96_000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        clearTimer();
        stopRecognition(false);
        releaseStream();
        const shouldDiscard = discardNextStopRef.current;
        discardNextStopRef.current = false;
        recorderRef.current = null;

        if (shouldDiscard || !mountedRef.current) {
          chunksRef.current = [];
          return;
        }

        const finalMimeType = recorder.mimeType || selectedMimeType || "audio/webm";
        const nextBlob = new Blob(chunksRef.current, { type: finalMimeType });
        chunksRef.current = [];

        if (nextBlob.size <= 0) {
          setError("No audio was captured. Check the microphone and try again.");
          setStatus("error");
          return;
        }
        if (nextBlob.size > MAX_AUDIO_BYTES) {
          setError("The voice note exceeds the 10 MB upload limit. Record a shorter note.");
          setStatus("error");
          return;
        }

        const nextUrl = URL.createObjectURL(nextBlob);
        setBlob(nextBlob);
        setMimeType(finalMimeType);
        replacePreviewUrl(nextUrl);
        setStatus("ready");
      });

      recorder.addEventListener("error", () => {
        clearTimer();
        stopRecognition(true);
        releaseStream();
        if (!mountedRef.current) return;
        setError("The browser could not continue recording. Try again.");
        setStatus("error");
      });

      recorder.start(1_000);
      if (options?.transcribe === true) startRecognition();
      setMimeType(recorder.mimeType || selectedMimeType || "audio/webm");
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setElapsedSeconds((current) => {
          const next = current + 1;
          if (next >= MAX_RECORDING_SECONDS) window.setTimeout(stop, 0);
          return Math.min(next, MAX_RECORDING_SECONDS);
        });
      }, 1_000);
    } catch (caught) {
      stopRecognition(true);
      releaseStream();
      if (!mountedRef.current) return;
      const name = caught instanceof DOMException ? caught.name : "";
      setError(name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in the browser and try again."
        : "The microphone could not be opened. Check the selected input device and try again.");
      setStatus("error");
    }
  }, [clearTimer, isSupported, releaseStream, replacePreviewUrl, startRecognition, status, stop, stopRecognition]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      stopRecognition(true);
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        discardNextStopRef.current = true;
        recorder.stop();
      }
      recorderRef.current = null;
      releaseStream();
      chunksRef.current = [];
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    };
  }, [clearTimer, releaseStream, stopRecognition]);

  return {
    status,
    blob,
    previewUrl,
    mimeType,
    elapsedSeconds,
    error,
    transcript,
    interimTranscript,
    transcriptionSupported,
    transcriptionError,
    isSupported,
    start,
    stop,
    reset,
  };
}
