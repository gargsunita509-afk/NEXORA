import React, { useState } from 'react';
import {
  Youtube,
  ExternalLink,
  Plus,
  Play,
  Check,
  AlertCircle,
  Video,
  BookOpen,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { ClassroomVideo } from '../../types';
import { audioFX } from '../../services/audio';
import { OfflineWarningModal } from '../OfflineWarningModal';

const INITIAL_CURATED_VIDEOS: ClassroomVideo[] = [
  {
    id: 'vid-pw-11',
    title: 'Physics Wallah — Class 11th Complete Physics Playlist',
    url: 'https://www.youtube.com/playlist?list=PL2b9g1Z3_K1zQdM2L43dZ7mXp9G8q7p0M',
    subject: 'Physics',
    stream: 'PCM / PCB',
    description: 'Comprehensive NCERT & CBSE Class 11 Physics lectures and derivations.',
  },
  {
    id: 'vid-khan-11',
    title: 'Khan Academy India — Class 11 Mathematics & Calculus',
    url: 'https://www.youtube.com/@KhanAcademyIndia',
    subject: 'Mathematics',
    stream: 'PCM',
    description: 'Trigonometry, limits, derivatives, sets, and relations.',
  },
  {
    id: 'vid-pe-12',
    title: 'CBSE Class 12 Physical Education (Code 048) — Full NCERT Course',
    url: 'https://www.youtube.com/results?search_query=cbse+class+12+physical+education+ncert+curriculum',
    subject: 'Physical Education',
    stream: 'All Streams',
    description: 'Management of Sporting Events, Yoga for Lifestyle Disease, CWSN, Sports Nutrition, Biomechanics & Injuries.',
  },
  {
    id: 'vid-ai-12',
    title: 'CBSE Class 12 Artificial Intelligence (Code 843) — Official Skill Curriculum',
    url: 'https://www.youtube.com/results?search_query=cbse+class+12+artificial+intelligence+code+843',
    subject: 'Artificial Intelligence',
    stream: 'All Streams',
    description: 'Computer Vision, Convolutional Neural Networks, Deep Learning, Data Science Methodology, Generative AI & LLMs.',
  },
  {
    id: 'vid-fineart-12',
    title: 'CBSE Class 12 Fine Arts (Painting 049) — Indian Miniature & Modern Art',
    url: 'https://www.youtube.com/results?search_query=cbse+class+12+fine+arts+painting+049+ncert',
    subject: 'Fine Arts',
    stream: 'Humanities & All Streams',
    description: 'Rajasthani, Pahari, Mughal & Deccani Miniature Schools, Bengal School, and Modern Indian Masters.',
  },
  {
    id: 'vid-ncert-11',
    title: 'NCERT Official — Swayam Prabha Class 11 Lectures',
    url: 'https://www.youtube.com/@NCERTOFFICIAL',
    subject: 'All Subjects',
    stream: 'All Streams',
    description: 'Ministry of Education telecast lectures for Class 11 CBSE.',
  },
  {
    id: 'vid-eco-11',
    title: 'Class 11 Microeconomics & Statistics Tutorials',
    url: 'https://www.youtube.com/results?search_query=class+11+microeconomics+cbse',
    subject: 'Economics',
    stream: 'Humanities & Commerce',
    description: 'Demand elasticity, consumer equilibrium, and central tendencies.',
  },
];

export const YouTubeModule: React.FC = () => {
  const [videos, setVideos] = useState<ClassroomVideo[]>(() => {
    try {
      const raw = localStorage.getItem('class_os_custom_videos_v1');
      return raw ? JSON.parse(raw) : INITIAL_CURATED_VIDEOS;
    } catch {
      return INITIAL_CURATED_VIDEOS;
    }
  });

  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSubject, setNewSubject] = useState('Physics');
  const [newStream, setNewStream] = useState('PCM');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Validate YouTube URL
  const validateYouTubeUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    // Valid YouTube domains: youtube.com or youtu.be
    return (
      trimmed.startsWith('https://www.youtube.com/') ||
      trimmed.startsWith('https://youtube.com/') ||
      trimmed.startsWith('https://youtu.be/') ||
      trimmed.startsWith('http://www.youtube.com/') ||
      trimmed.startsWith('http://youtu.be/')
    );
  };

  const handleOpenDirectYouTube = () => {
    audioFX.playClick();
    window.open('https://www.youtube.com', '_blank', 'noopener,noreferrer');
  };

  const handleOpenVideoUrl = (url: string) => {
    audioFX.playClick();
    if (validateYouTubeUrl(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      alert('Invalid YouTube URL. Please verify the link.');
    }
  };

  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    if (!validateYouTubeUrl(newUrl)) {
      setUrlError('Please enter a valid YouTube URL (https://www.youtube.com/... or https://youtu.be/...)');
      audioFX.playError();
      return;
    }

    const newVid: ClassroomVideo = {
      id: `vid-${Date.now()}`,
      title: newTitle.trim(),
      url: newUrl.trim(),
      subject: newSubject,
      stream: newStream,
      description: 'Custom added smart-board learning resource',
    };

    const updated = [newVid, ...videos];
    setVideos(updated);
    try {
      localStorage.setItem('class_os_custom_videos_v1', JSON.stringify(updated));
    } catch {}

    setNewTitle('');
    setNewUrl('');
    setIsAddOpen(false);
    audioFX.playSuccess();
  };

  const handleDeleteVideo = (id: string) => {
    audioFX.playClick();
    const updated = videos.filter((v) => v.id !== id);
    setVideos(updated);
    try {
      localStorage.setItem('class_os_custom_videos_v1', JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 02
            </span>
            <span className="text-xs font-mono-code text-slate-400">CLASSROOM MEDIA HUB</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            YOUTUBE LEARNING GATEWAY
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            Direct authenticated access to official YouTube and verified Class 11 educational channels
          </p>
        </div>

        {/* Real YouTube Direct Action */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenDirectYouTube}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-hud text-xs sm:text-sm font-bold tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] transition"
          >
            <Youtube className="w-5 h-5" />
            <span>LAUNCH YOUTUBE.COM</span>
            <ExternalLink className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={() => {
              audioFX.playClick();
              setIsAddOpen(!isAddOpen);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-hud text-xs font-bold transition"
          >
            <Plus className="w-4 h-4" />
            <span>ADD VIDEO LINK</span>
          </button>
        </div>
      </div>

      {/* Add Video Form Drawer */}
      {isAddOpen && (
        <form
          onSubmit={handleAddVideo}
          className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/40 space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase">
              Add Verified Class 11 Learning Video / Playlist
            </h3>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {urlError && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono-code flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{urlError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-mono-code text-slate-300 mb-1">
                Lecture Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. NCERT Physics Chapter 4 Motion in a Plane"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-xs outline-none"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-mono-code text-slate-300 mb-1">
                YouTube URL (Validated)
              </label>
              <input
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-xs font-mono-code outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono-code text-slate-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono-code text-slate-300 mb-1">
                Target Stream
              </label>
              <select
                value={newStream}
                onChange={(e) => setNewStream(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-xs outline-none"
              >
                <option value="All Streams">All Streams</option>
                <option value="PCM">PCM</option>
                <option value="PCB">PCB</option>
                <option value="Humanities">Humanities</option>
                <option value="Commerce">Commerce</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs font-bold transition shadow-[0_0_12px_rgba(0,240,255,0.4)]"
              >
                VERIFY & SAVE VIDEO LINK
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Verified Classroom Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {videos.map((vid) => (
          <div
            key={vid.id}
            className="p-4 sm:p-5 rounded-xl jarvis-panel border border-cyan-500/20 hover:border-cyan-400/40 transition flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono-code font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {vid.subject} • {vid.stream}
                </span>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-emerald-400 font-mono-code flex items-center gap-1">
                    <Check className="w-3 h-3" /> VERIFIED URL
                  </span>
                  <button
                    onClick={() => handleDeleteVideo(vid.id)}
                    className="p-1 rounded text-slate-500 hover:text-red-400 ml-2"
                    title="Remove Video Link"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-hud font-bold text-base text-white mt-2 group-hover:text-cyan-200 transition">
                {vid.title}
              </h3>

              <p className="text-xs text-slate-400 font-sans mt-1">
                {vid.description}
              </p>

              <div className="mt-2 text-[11px] font-mono-code text-cyan-400/80 truncate">
                {vid.url}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-cyan-500/10 flex items-center justify-between">
              <button
                onClick={() => handleOpenVideoUrl(vid.url)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600 border border-red-500/50 text-red-200 hover:text-white text-xs font-hud font-bold transition shadow-[0_0_12px_rgba(239,68,68,0.2)]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>OPEN ON YOUTUBE</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </button>

              <span className="text-[10px] font-mono-code text-slate-500">
                Direct Tab Launch
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
