import React, { useState, useEffect } from 'react';
import {
  StickyNote,
  X,
  Send,
  Trash2,
  Pin,
  ExternalLink,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { StaffQuickNote, StaffUser } from '../types';
import { staffContentService } from '../services/staffContentService';

interface QuickNotesFABProps {
  onOpenFullModule?: () => void;
}

export const QuickNotesFAB: React.FC<QuickNotesFABProps> = ({ onOpenFullModule }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(
    staffContentService.getCurrentStaffUser()
  );
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<StaffQuickNote[]>(
    staffContentService.getMemoryQuickNotes()
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = staffContentService.subscribe(() => {
      const current = staffContentService.getCurrentStaffUser();
      setStaffUser(current);
      setNotes(staffContentService.getMemoryQuickNotes());
      if (!current) {
        setIsOpen(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen && staffUser) {
      staffContentService.fetchQuickNotes().then((res) => {
        if (!res.error) {
          setNotes(res.notes);
        }
      });
    }
  }, [isOpen, staffUser?.id]);

  // Strictly hide QuickNotesFAB from students and unauthenticated users
  if (
    !staffUser ||
    (staffUser.role !== 'teacher_in_charge' && staffUser.role !== 'developer')
  ) {
    return null;
  }

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !content.trim()) return;
    setError(null);
    setSaving(true);
    const res = await staffContentService.createQuickNote({
      title: title.trim(),
      content: content.trim(),
      category: 'general',
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'Failed to save Quick Note');
      return;
    }
    setTitle('');
    setContent('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 lg:bottom-8 right-6 z-40 px-4 py-3 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 text-white shadow-[0_0_25px_rgba(139,92,246,0.45)] flex items-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
        title="Staff Quick Notes (Teacher/In-Charge & Developer Only)"
      >
        <StickyNote className="w-5 h-5" />
        <span className="text-xs font-bold tracking-wide hidden sm:inline">
          Staff Quick Notes
        </span>
        {notes.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
            {notes.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0B0F19]/95 border-l border-violet-500/30 h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Staff Quick Notes
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {staffUser.displayName} ({staffUser.roleLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {onOpenFullModule && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenFullModule();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 text-xs font-semibold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Full View
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleQuickAdd} className="p-4 border-b border-white/10 space-y-2.5">
              {error && (
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {error}
                </div>
              )}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note subject (optional)..."
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white focus:border-violet-400 focus:outline-none"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                placeholder="Write a private note shared between Teacher/In-Charge and Developer..."
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/15 text-xs text-white focus:border-violet-400 focus:outline-none"
                required
              />
              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {saving ? 'Posting...' : 'Post to Shared Staff Feed'}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notes.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No staff Quick Notes yet.
                </div>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {n.pinned && <Pin className="w-3 h-3 text-amber-400" />}
                        <span className="text-xs font-bold text-cyan-300">{n.authorName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">
                          {n.authorRoleLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => staffContentService.deleteQuickNote(n.id)}
                        className="text-slate-500 hover:text-rose-400"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {n.title && <div className="text-xs font-bold text-white">{n.title}</div>}
                    <p className="text-xs text-slate-300 whitespace-pre-wrap">{n.content}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>{new Date(n.updatedAt || n.createdAt).toLocaleString()}</span>
                      {n.syncStatus === 'pending' ? (
                        <span className="text-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending Sync
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Synced
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
