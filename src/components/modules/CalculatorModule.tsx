import React, { useState, useEffect, useRef } from 'react';
import {
  Calculator as CalcIcon,
  RotateCcw,
  Copy,
  Check,
  History,
  FileText,
  Save,
  Download,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  ArrowRight,
  CornerDownRight,
  Type,
  Bold,
  List,
  ListOrdered,
  Code,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { MathEvaluator, AngleMode } from '../../utils/mathParser';
import { CalculatorHistoryItem, CalculatorNote } from '../../types';
import { storage } from '../../services/storage';
import { audioFX } from '../../services/audio';

const STORAGE_CALC_HISTORY = 'class_os_calc_history_v1';
const STORAGE_CALC_ANGLE = 'class_os_calc_angle_mode_v1';

export const CalculatorModule: React.FC = () => {
  // Mobile Tab view: 'calculator' | 'notepad'
  const [mobileTab, setMobileTab] = useState<'calculator' | 'notepad'>('calculator');

  // --- CALCULATOR STATE ---
  const [expression, setExpression] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>(() => {
    return (localStorage.getItem(STORAGE_CALC_ANGLE) as AngleMode) || 'DEG';
  });
  const [history, setHistory] = useState<CalculatorHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CALC_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Evaluator ref using our safe AST / Shunting-yard parser (NO eval or Function)
  const evaluatorRef = useRef(new MathEvaluator(angleMode));

  useEffect(() => {
    evaluatorRef.current.setAngleMode(angleMode);
    try {
      localStorage.setItem(STORAGE_CALC_ANGLE, angleMode);
    } catch {}
  }, [angleMode]);

  // --- DIGITAL NOTEPAD STATE ---
  const [notes, setNotes] = useState<CalculatorNote[]>(() => storage.getCalculatorNotes());
  const [activeNoteId, setActiveNoteId] = useState<string>(() => {
    const list = storage.getCalculatorNotes();
    return list[0]?.id || 'note-default';
  });
  const [activeNoteContent, setActiveNoteContent] = useState<string>('');
  const [activeNoteTitle, setActiveNoteTitle] = useState<string>('');
  const [noteSaveStatus, setNoteSaveStatus] = useState<string>('Saved');
  const [isRenameNoteOpen, setIsRenameNoteOpen] = useState<boolean>(false);
  const [renameNoteInput, setRenameNoteInput] = useState<string>('');
  const notepadTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load active note content
  useEffect(() => {
    const current = notes.find((n) => n.id === activeNoteId) || notes[0];
    if (current) {
      setActiveNoteContent(current.content);
      setActiveNoteTitle(current.title);
      setNoteSaveStatus('Saved');
    }
  }, [activeNoteId]);

  // Debounced auto-save for digital notepad
  const handleNoteContentChange = (newVal: string) => {
    setActiveNoteContent(newVal);
    setNoteSaveStatus('Saving...');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const updatedNotes = notes.map((n) =>
        n.id === activeNoteId ? { ...n, content: newVal, updatedAt: Date.now() } : n
      );
      setNotes(updatedNotes);
      storage.saveCalculatorNotes(updatedNotes);
      setNoteSaveStatus('Saved');
    }, 600);
  };

  // --- CALCULATOR ACTIONS ---
  const handleAppend = (token: string) => {
    audioFX.playClick();
    setErrorMessage(null);
    setExpression((prev) => prev + token);
  };

  const handleClear = () => {
    audioFX.playClick();
    setExpression('');
    setResult('');
    setErrorMessage(null);
  };

  const handleDelete = () => {
    audioFX.playClick();
    setErrorMessage(null);
    setExpression((prev) => prev.slice(0, -1));
  };

  const handleToggleAngleMode = () => {
    audioFX.playClick();
    const next = angleMode === 'DEG' ? 'RAD' : 'DEG';
    setAngleMode(next);
  };

  const handleEvaluate = () => {
    if (!expression.trim()) return;
    audioFX.playClick();

    try {
      const res = evaluatorRef.current.evaluate(expression);
      const resStr = String(res);
      setResult(resStr);
      setErrorMessage(null);
      audioFX.playSuccess();

      // Record in history
      const item: CalculatorHistoryItem = {
        id: `calc-${Date.now()}`,
        expression,
        result: resStr,
        angleMode,
        timestamp: Date.now(),
      };
      const updated = [item, ...history.slice(0, 19)];
      setHistory(updated);
      try {
        localStorage.setItem(STORAGE_CALC_HISTORY, JSON.stringify(updated));
      } catch {}
    } catch (err: any) {
      setErrorMessage(err.message || 'Syntax Error');
      audioFX.playError();
    }
  };

  const handleCopy = (text: string, id: string) => {
    audioFX.playClick();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleReuseHistory = (item: CalculatorHistoryItem) => {
    audioFX.playClick();
    setExpression(item.expression);
    setResult(item.result);
    setErrorMessage(null);
  };

  // --- CONNECTED CALCULATOR + NOTEPAD ACTIONS ---
  const handleInsertResultIntoNotes = (customVal?: string) => {
    const valToInsert = customVal || result;
    if (!valToInsert) return;
    audioFX.playClick();

    const textarea = notepadTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || activeNoteContent.length;
      const end = textarea.selectionEnd || activeNoteContent.length;
      const before = activeNoteContent.substring(0, start);
      const after = activeNoteContent.substring(end);
      const inserted = `${valToInsert}`;
      const newText = `${before}${inserted}${after}`;
      handleNoteContentChange(newText);

      // Re-position cursor right after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + inserted.length, start + inserted.length);
      }, 50);
    } else {
      const newText = activeNoteContent ? `${activeNoteContent} ${valToInsert}` : valToInsert;
      handleNoteContentChange(newText);
    }
    audioFX.playSuccess();
  };

  const handleInsertExpressionIntoNotes = (customExpr?: string) => {
    const exprToInsert = customExpr || expression;
    if (!exprToInsert) return;
    audioFX.playClick();

    const textToInsert = result ? `${exprToInsert} = ${result}` : exprToInsert;
    const textarea = notepadTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || activeNoteContent.length;
      const end = textarea.selectionEnd || activeNoteContent.length;
      const before = activeNoteContent.substring(0, start);
      const after = activeNoteContent.substring(end);
      const newText = `${before}\n${textToInsert}\n${after}`;
      handleNoteContentChange(newText);
    } else {
      const newText = `${activeNoteContent}\n${textToInsert}`;
      handleNoteContentChange(newText);
    }
    audioFX.playSuccess();
  };

  // --- NOTEPAD ACTIONS ---
  const handleCreateNewNote = () => {
    audioFX.playClick();
    const newNote: CalculatorNote = {
      id: `note-${Date.now()}`,
      title: `Note ${notes.length + 1}`,
      content: `# Note ${notes.length + 1}\n- Date: ${new Date().toLocaleDateString()}\n\n`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...notes, newNote];
    setNotes(updated);
    setActiveNoteId(newNote.id);
    storage.saveCalculatorNotes(updated);
  };

  const handleRenameNote = () => {
    if (!renameNoteInput.trim()) return;
    audioFX.playClick();
    const updated = notes.map((n) =>
      n.id === activeNoteId ? { ...n, title: renameNoteInput.trim(), updatedAt: Date.now() } : n
    );
    setNotes(updated);
    setActiveNoteTitle(renameNoteInput.trim());
    storage.saveCalculatorNotes(updated);
    setIsRenameNoteOpen(false);
  };

  const handleDeleteNote = (id: string) => {
    if (notes.length <= 1) {
      alert('Cannot delete the only remaining note.');
      return;
    }
    const target = notes.find((n) => n.id === id);
    if (!window.confirm(`Delete note "${target?.title || 'this note'}"?`)) return;

    audioFX.playClick();
    const filtered = notes.filter((n) => n.id !== id);
    setNotes(filtered);
    storage.saveCalculatorNotes(filtered);
    if (activeNoteId === id) {
      setActiveNoteId(filtered[0].id);
    }
  };

  const handleClearActiveNote = () => {
    if (!window.confirm('Clear all text from this note?')) return;
    audioFX.playClick();
    handleNoteContentChange('');
  };

  const handleDownloadNote = () => {
    audioFX.playClick();
    const blob = new Blob([activeNoteContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNoteTitle.replace(/\s+/g, '_')}_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    audioFX.playSuccess();
  };

  // Quick formatting helpers for notepad
  const applyFormatting = (prefix: string, suffix: string = '') => {
    const textarea = notepadTextareaRef.current;
    if (!textarea) return;
    audioFX.playClick();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = activeNoteContent.substring(start, end) || 'text';
    const before = activeNoteContent.substring(0, start);
    const after = activeNoteContent.substring(end);
    const formatted = `${prefix}${selected}${suffix}`;
    const newContent = `${before}${formatted}${after}`;
    handleNoteContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 50);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 10
            </span>
            <span className="text-xs font-mono-code text-slate-400">UNIFIED WORKSPACE</span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-400/30 text-blue-300 font-mono-code text-[10px] uppercase">
              Connected Tools
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            SMART CALCULATOR & NOTES
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            Full Class 11 Scientific Calculator on the left • Digital Working Notepad on the right
          </p>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden items-center p-1 rounded-xl bg-slate-900 border border-cyan-500/20">
          <button
            onClick={() => {
              audioFX.playClick();
              setMobileTab('calculator');
            }}
            className={`px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
              mobileTab === 'calculator'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            CALCULATOR
          </button>
          <button
            onClick={() => {
              audioFX.playClick();
              setMobileTab('notepad');
            }}
            className={`px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
              mobileTab === 'notepad'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            NOTEPAD ({notes.length})
          </button>
        </div>
      </div>

      {/* Main Connected Workspace: Split Layout on tablet/laptop/smart board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: SCIENTIFIC CALCULATOR (5 cols on lg, 6 cols on xl) */}
        <div
          className={`lg:col-span-6 xl:col-span-6 space-y-4 ${
            mobileTab === 'notepad' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-3">
            {/* Display Screen */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-[#030611] border border-cyan-500/40 relative shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono-code mb-2">
                <button
                  onClick={handleToggleAngleMode}
                  className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold hover:bg-cyan-500/30 transition"
                  title="Click to toggle Degrees / Radians"
                >
                  MODE: {angleMode}
                </button>

                <div className="flex items-center gap-2">
                  {result && (
                    <button
                      onClick={() => handleCopy(result, 'curr-res')}
                      className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition text-[11px]"
                    >
                      {copiedId === 'curr-res' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === 'curr-res' ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Expression input */}
              <input
                type="text"
                value={expression}
                onChange={(e) => {
                  setExpression(e.target.value);
                  setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEvaluate();
                }}
                placeholder="Enter expression (e.g. sin(30) + 5! or 17 mod 5)"
                className="w-full bg-transparent text-slate-200 font-mono-code text-right text-base sm:text-xl outline-none"
              />

              {/* Output Result */}
              <div className="min-h-[32px] flex items-center justify-end font-mono-code font-bold text-xl sm:text-3xl text-cyan-400 mt-1 truncate">
                {result ? `= ${result}` : ''}
              </div>

              {errorMessage && (
                <div className="mt-1 text-xs font-mono-code text-red-400 flex items-center justify-end gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Quick Action Bridge: Insert into Notes */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => handleInsertResultIntoNotes()}
                disabled={!result}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:opacity-40 text-black font-hud text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)] transition"
                title="Insert evaluated result at cursor position in digital notepad"
              >
                <CornerDownRight className="w-3.5 h-3.5" />
                <span>INSERT RESULT INTO NOTES</span>
              </button>

              <button
                onClick={() => handleInsertExpressionIntoNotes()}
                disabled={!expression}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-cyan-300 font-hud text-xs font-bold transition"
                title="Insert calculation expression and result into notes"
              >
                <span>INSERT EXPR</span>
              </button>
            </div>

            {/* Calculator Keypad */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 pt-2">
              {/* Row 1 */}
              <button
                onClick={handleToggleAngleMode}
                className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono-code text-xs font-bold hover:bg-cyan-900/40"
              >
                {angleMode}
              </button>
              <button
                onClick={() => handleAppend('sin(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                sin
              </button>
              <button
                onClick={() => handleAppend('cos(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                cos
              </button>
              <button
                onClick={() => handleAppend('tan(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                tan
              </button>
              <button
                onClick={() => handleAppend('pi')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                π
              </button>
              <button
                onClick={handleClear}
                className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 font-hud text-xs font-bold hover:bg-red-900/50"
              >
                AC
              </button>

              {/* Row 2 */}
              <button
                onClick={() => handleAppend('asin(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                sin⁻¹
              </button>
              <button
                onClick={() => handleAppend('acos(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                cos⁻¹
              </button>
              <button
                onClick={() => handleAppend('atan(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                tan⁻¹
              </button>
              <button
                onClick={() => handleAppend('log(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                log
              </button>
              <button
                onClick={() => handleAppend('ln(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold hover:text-cyan-300"
              >
                ln
              </button>
              <button
                onClick={handleDelete}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-xs font-bold hover:text-white"
              >
                DEL
              </button>

              {/* Row 3 */}
              <button
                onClick={() => handleAppend('^')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                xʸ
              </button>
              <button
                onClick={() => handleAppend('sqrt(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                √x
              </button>
              <button
                onClick={() => handleAppend('!')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                x!
              </button>
              <button
                onClick={() => handleAppend(' nPr ')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                nPr
              </button>
              <button
                onClick={() => handleAppend(' nCr ')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                nCr
              </button>
              <button
                onClick={() => handleAppend('/')}
                className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono-code text-sm font-bold"
              >
                ÷
              </button>

              {/* Row 4 */}
              <button
                onClick={() => handleAppend('abs(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
                title="Absolute value: |-5| = 5"
              >
                |x|
              </button>
              <button
                onClick={() => handleAppend('7')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                7
              </button>
              <button
                onClick={() => handleAppend('8')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                8
              </button>
              <button
                onClick={() => handleAppend('9')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                9
              </button>
              <button
                onClick={() => handleAppend('(')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-sm font-bold"
              >
                (
              </button>
              <button
                onClick={() => handleAppend('*')}
                className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono-code text-sm font-bold"
              >
                ×
              </button>

              {/* Row 5 */}
              <button
                onClick={() => handleAppend(' mod ')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
                title="Remainder / Modulus: 17 mod 5 = 2"
              >
                mod
              </button>
              <button
                onClick={() => handleAppend('4')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                4
              </button>
              <button
                onClick={() => handleAppend('5')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                5
              </button>
              <button
                onClick={() => handleAppend('6')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                6
              </button>
              <button
                onClick={() => handleAppend(')')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-sm font-bold"
              >
                )
              </button>
              <button
                onClick={() => handleAppend('-')}
                className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono-code text-sm font-bold"
              >
                −
              </button>

              {/* Row 6 */}
              <button
                onClick={() => handleAppend('e')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-mono-code text-xs font-bold"
              >
                e
              </button>
              <button
                onClick={() => handleAppend('1')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                1
              </button>
              <button
                onClick={() => handleAppend('2')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                2
              </button>
              <button
                onClick={() => handleAppend('3')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                3
              </button>
              <button
                onClick={() => handleAppend('0')}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white font-mono-code text-sm font-bold hover:bg-slate-900"
              >
                0
              </button>
              <button
                onClick={() => handleAppend('+')}
                className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono-code text-sm font-bold"
              >
                +
              </button>

              {/* Bottom Row */}
              <button
                onClick={() => handleAppend('%')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-mono-code text-xs font-bold"
              >
                %
              </button>
              <button
                onClick={() => handleAppend('.')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono-code text-sm font-bold"
              >
                .
              </button>
              <button
                onClick={handleEvaluate}
                className="col-span-4 p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-sm font-extrabold shadow-[0_0_15px_rgba(0,240,255,0.4)] transition"
              >
                = EVALUATE
              </button>
            </div>
          </div>

          {/* Quick Calculation History */}
          {history.length > 0 && (
            <div className="p-3.5 rounded-xl jarvis-panel border border-cyan-500/20 text-xs font-mono-code">
              <div className="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-cyan-500/10">
                <span className="font-hud font-bold text-cyan-400">Recent Calculations</span>
                <span className="text-[10px]">Click to reuse or insert</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {history.slice(0, 5).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-cyan-500/40 cursor-pointer"
                    onClick={() => handleReuseHistory(h)}
                  >
                    <span className="text-slate-300 truncate">{h.expression}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-cyan-300 font-bold">= {h.result}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInsertResultIntoNotes(h.result);
                        }}
                        className="p-1 text-slate-400 hover:text-cyan-300"
                        title="Insert result into notepad"
                      >
                        <CornerDownRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DIGITAL NOTEPAD (6 cols on lg, 6 cols on xl) */}
        <div
          className={`lg:col-span-6 xl:col-span-6 space-y-4 ${
            mobileTab === 'calculator' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-3 flex flex-col h-full min-h-[580px]">
            {/* Notepad Top Bar: Notes Selector & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-cyan-500/20">
              {/* Note Selector Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full sm:max-w-xs scrollbar-none">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => {
                      audioFX.playClick();
                      setActiveNoteId(note.id);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-hud font-bold cursor-pointer whitespace-nowrap transition ${
                      note.id === activeNoteId
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                        : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <span className="truncate max-w-[100px]">{note.title}</span>
                    {note.id === activeNoteId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameNoteInput(note.title);
                          setIsRenameNoteOpen(true);
                        }}
                        className="p-0.5 text-slate-400 hover:text-cyan-300"
                        title="Rename note"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                    {notes.length > 1 && note.id === activeNoteId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        className="p-0.5 text-slate-500 hover:text-red-400"
                        title="Delete note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={handleCreateNewNote}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200 text-xs"
                  title="Create new note"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>

              {/* Actions & Save status */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono-code text-slate-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{noteSaveStatus}</span>
                </span>

                <button
                  onClick={handleClearActiveNote}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400"
                  title="Clear note text"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleDownloadNote}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-hud font-bold"
                  title="Export note as .txt file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">EXPORT TXT</span>
                </button>
              </div>
            </div>

            {/* Quick Text Formatting Toolbar */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-cyan-500/10 text-xs font-mono-code overflow-x-auto">
              <button
                onClick={() => applyFormatting('### ')}
                className="px-2 py-1 rounded bg-slate-900 text-slate-300 hover:text-cyan-300"
                title="Heading 3"
              >
                H3
              </button>
              <button
                onClick={() => applyFormatting('**', '**')}
                className="px-2 py-1 rounded bg-slate-900 text-slate-300 hover:text-cyan-300"
                title="Bold text"
              >
                <strong>B</strong>
              </button>
              <button
                onClick={() => applyFormatting('\n- ')}
                className="px-2 py-1 rounded bg-slate-900 text-slate-300 hover:text-cyan-300 flex items-center gap-1"
                title="Bullet list item"
              >
                <List className="w-3 h-3" />
                <span>List</span>
              </button>
              <button
                onClick={() => applyFormatting('\n1. ')}
                className="px-2 py-1 rounded bg-slate-900 text-slate-300 hover:text-cyan-300 flex items-center gap-1"
                title="Numbered step"
              >
                <ListOrdered className="w-3 h-3" />
                <span>Step</span>
              </button>
              <button
                onClick={() => applyFormatting('$$\n', '\n$$')}
                className="px-2 py-1 rounded bg-slate-900 text-slate-300 hover:text-cyan-300 flex items-center gap-1"
                title="Math formula block"
              >
                <Code className="w-3 h-3" />
                <span>Math</span>
              </button>

              <div className="flex-1 text-right text-[10px] text-slate-500 font-mono-code pr-1">
                {activeNoteContent.length} chars
              </div>
            </div>

            {/* Large Editable Text Area */}
            <div className="flex-1 flex flex-col relative min-h-[380px]">
              <textarea
                ref={notepadTextareaRef}
                value={activeNoteContent}
                onChange={(e) => handleNoteContentChange(e.target.value)}
                placeholder="Write classroom formulas, derivations, step-by-step problem solutions, and homework explanations here... Auto-saved locally."
                className="flex-1 w-full p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-slate-100 font-mono-code text-xs sm:text-sm leading-relaxed outline-none focus:border-cyan-400 resize-none shadow-inner"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rename Note Modal */}
      {isRenameNoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl jarvis-panel border border-cyan-500/40 p-5 space-y-3 shadow-2xl">
            <h4 className="font-hud font-bold text-sm text-white uppercase">
              Rename Note
            </h4>
            <input
              type="text"
              autoFocus
              value={renameNoteInput}
              onChange={(e) => setRenameNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameNote();
                if (e.key === 'Escape') setIsRenameNoteOpen(false);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-cyan-500/30 text-white text-xs outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRenameNoteOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameNote}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 text-black font-bold text-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
