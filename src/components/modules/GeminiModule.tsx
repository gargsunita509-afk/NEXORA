import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  ExternalLink,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Trash2,
  CheckCircle,
  BookOpen,
  Code,
  Zap,
} from 'lucide-react';
import { geminiClient, ChatMessage, HealthCheckResponse } from '../../services/gemini';
import { audioFX } from '../../services/audio';

const QUICK_PROMPTS = [
  'Explain Projectile Motion formulas and maximum height derivation (Class 11 Physics)',
  'Help me understand Bohr’s Atomic Model and Quantum numbers (Class 11 Chemistry)',
  'Prove trigonometric identity: sin(A+B) = sinA cosB + cosA sinB (Class 11 Math)',
  'Class 12 PE: Explain Knockout Tournament fixture calculation and Bye formula',
  'Class 12 AI: How does Computer Vision utilize Convolutional Neural Networks (CNNs)?',
  'Class 12 Fine Arts: Analyze the composition of Maru Ragini and Bani Thani miniature paintings',
  'What is Price Elasticity of Demand and how is it calculated? (Class 11 Eco)',
  'Explain Newton’s Third Law with practical real-life examples',
];

export const GeminiModule: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => geminiClient.getLocalHistory());
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverHealth, setServerHealth] = useState<HealthCheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    geminiClient.checkHealth().then(setServerHealth);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() || isLoading) return;

    audioFX.playClick();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    geminiClient.saveLocalHistory(updated);
    setInputPrompt('');
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const reply = await geminiClient.sendPrompt(text.trim(), messages);
      const modelMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        text: reply,
        timestamp: Date.now(),
      };
      const finalHistory = [...updated, modelMsg];
      setMessages(finalHistory);
      geminiClient.saveLocalHistory(finalHistory);
      audioFX.playSuccess();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message ||
          'Unable to reach Gemini AI backend. Verify server configuration or use the official Gemini shortcut.'
      );
      audioFX.playError();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (!window.confirm('Clear conversation history?')) return;
    audioFX.playClick();
    geminiClient.clearLocalHistory();
    setMessages([
      {
        id: 'msg-reset',
        role: 'model',
        text: 'Conversation history cleared. Ready for new Class 11 questions.',
        timestamp: Date.now(),
      },
    ]);
  };

  const handleOpenOfficialGemini = () => {
    audioFX.playClick();
    window.open('https://gemini.google.com', '_blank', 'noopener,noreferrer');
  };

  const isConfigured = Boolean(serverHealth?.geminiConfigured);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 08
            </span>
            <span className="text-xs font-mono-code text-slate-400">ACADEMIC COPILOT</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            GEMINI AI CLASSROOM ASSISTANT
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            Syllabus tutoring • Step-by-step math derivations • Concept clarifications
          </p>
        </div>

        {/* Official Gemini Shortcut Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenOfficialGemini}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-hud text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(79,70,229,0.4)] transition"
          >
            <Bot className="w-4 h-4" />
            <span>LAUNCH GEMINI.GOOGLE.COM</span>
            <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>

      {/* Backend Status Notice Banner if Not Configured */}
      {!isConfigured && (
        <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono-code">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Server-side GEMINI_API_KEY:</strong>{' '}
              <span className="text-slate-300">
                To activate in-app AI study chat, configure <code className="text-cyan-300">GEMINI_API_KEY</code> in project secrets. You can also use the direct button above to access official Gemini anytime.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Prompts Carousel */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono-code text-cyan-400/80 uppercase font-bold">
          Quick Study Prompts
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-400/50 text-slate-300 hover:text-cyan-200 text-xs font-sans whitespace-nowrap transition"
            >
              ⚡ {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="rounded-2xl jarvis-panel border border-cyan-500/30 overflow-hidden flex flex-col h-[520px]">
        {/* Chat Header */}
        <div className="px-4 py-3 border-b border-cyan-500/20 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-hud font-bold text-xs text-white uppercase tracking-wider">
              NEXORA ACADEMIC ASSISTANT (GEMINI-3.8-FLASH)
            </span>
          </div>

          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1 text-[11px] font-mono-code text-slate-400 hover:text-red-400 transition"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-cyan-300" />
                  </div>
                )}

                <div
                  className={`p-3.5 sm:p-4 rounded-2xl max-w-[85%] text-xs sm:text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-cyan-600 text-black font-medium rounded-tr-none shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                      : 'bg-slate-900/90 border border-cyan-500/20 text-slate-100 rounded-tl-none shadow-md'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-cyan-300 animate-spin" />
              </div>
              <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/20 text-xs font-mono-code text-cyan-400 animate-pulse">
                Analyzing Class 11 academic syllabus...
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono-code flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Error:</strong> {errorMessage}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 border-t border-cyan-500/20 bg-slate-950/80 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask a question in Physics, Chemistry, Maths, Economics, English..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/30 text-white text-xs sm:text-sm outline-none focus:border-cyan-400 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={isLoading || !inputPrompt.trim()}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-hud text-xs font-bold transition shadow-[0_0_12px_rgba(0,240,255,0.4)] flex items-center gap-1.5"
          >
            <span>SEND</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
