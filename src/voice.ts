/**
 * VOICE SYSTEM
 * Handles speech recognition setup and cleanup.
 */

export function setupSpeechRecognition(onResult: (text: string, confidence: number) => void, onError: (error: string) => void, onEnd: () => void) {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    onError("Speech recognition not supported in this browser.");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // Can be dynamic

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    onResult(text, confidence);
  };

  recognition.onerror = (event: any) => {
    onError(event.error);
  };

  recognition.onend = () => {
    onEnd();
  };

  return recognition;
}
