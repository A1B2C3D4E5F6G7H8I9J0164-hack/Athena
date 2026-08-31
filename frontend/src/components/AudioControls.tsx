import { useState, useEffect } from "react";
import { Mic, Volume2, VolumeX } from "lucide-react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInputButton({ onTranscript, disabled }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (disabled || !supported) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onTranscript(transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? "Listening... Click to stop" : "Voice Dictation"}
      className={`relative p-2 rounded-xl border transition-all flex items-center justify-center ${
        isListening
          ? "bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-lg shadow-rose-500/20 animate-pulse"
          : "border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/15"
      }`}
    >
      {isListening ? (
        <div className="flex items-center gap-1 px-1">
          <div className="w-1 h-3 bg-rose-400 rounded-full wave-bar" />
          <div className="w-1 h-4 bg-rose-400 rounded-full wave-bar" />
          <div className="w-1 h-2 bg-rose-400 rounded-full wave-bar" />
        </div>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}

interface TTSProps {
  text: string;
}

export function AudioReaderButton({ text }: TTSProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleSpeak = () => {
    if (!window.speechSynthesis) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\[\d+\]/g, "").replace(/[#*_`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={toggleSpeak}
      title={isPlaying ? "Stop audio narration" : "Read answer aloud"}
      className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
        isPlaying
          ? "bg-athena-cyan/20 text-athena-cyan border border-athena-cyan/30"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
      }`}
    >
      {isPlaying ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      <span className="text-[11px]">{isPlaying ? "Mute" : "Listen"}</span>
    </button>
  );
}
