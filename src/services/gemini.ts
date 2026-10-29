import { resolveApiUrl } from './updateService';
import { apkAwareFetch as fetch } from './apkApiBridge';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface HealthCheckResponse {
  status: string;
  geminiConfigured: boolean;
  school: string;
  class: string;
  inCharge: string;
  timestamp: string;
}

class GeminiClientService {
  private historyKey = 'class_os_gemini_history_v1';

  async checkHealth(): Promise<HealthCheckResponse> {
    try {
      const res = await fetch(resolveApiUrl('/api/health'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch {
      return {
        status: 'error',
        geminiConfigured: false,
        school: 'THE ABHINAV SCHOOL',
        class: 'CLASS 11TH',
        inCharge: 'Alka Mam',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async sendPrompt(prompt: string, history: ChatMessage[] = []): Promise<string> {
    const payload = {
      prompt,
      history: history.map((m) => ({ role: m.role, text: m.text })),
    };

    const res = await fetch(resolveApiUrl('/api/gemini/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Server responded with code ${res.status}`);
    }

    return data.reply;
  }

  getLocalHistory(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(this.historyKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: 'msg-welcome',
        role: 'model',
        text: `### Systems Online. Welcome to CLASS OS Academic Assistant.
I am configured for **Class 11th at The Abhinav School** under **Alka Mam**.
How can I assist your lecture today?
- Ask physics derivations (Kinematics, Newton's Laws)
- Chemistry electronic configurations or stoichiometry
- Mathematics trigonometry formulas and calculus basics
- Economics microeconomics concepts or Accounts balance sheets
- English chapter summaries or writing skills`,
        timestamp: Date.now(),
      },
    ];
  }

  saveLocalHistory(history: ChatMessage[]) {
    try {
      localStorage.setItem(this.historyKey, JSON.stringify(history));
    } catch {}
  }

  clearLocalHistory() {
    try {
      localStorage.removeItem(this.historyKey);
    } catch {}
  }
}

export const geminiClient = new GeminiClientService();
