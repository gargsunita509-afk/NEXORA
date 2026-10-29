import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PenTool,
  Edit2,
  Highlighter,
  Eraser,
  Square,
  Circle as CircleIcon,
  Minus,
  MoveRight,
  Triangle,
  Hexagon,
  Type,
  MousePointer,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  Maximize2,
  Minimize2,
  FolderPlus,
  Grid,
  Palette,
  Check,
  Edit3,
  Sliders,
  Settings2,
  X,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { CanvasStroke, DrawingTool, Point, Whiteboard, WhiteboardBg } from '../../types';
import { storage } from '../../services/storage';
import { audioFX } from '../../services/audio';

const PRESET_COLORS = [
  { label: 'Black', color: '#000000', border: 'border-slate-500' },
  { label: 'White', color: '#ffffff', border: 'border-slate-400' },
  { label: 'Red', color: '#ef4444', border: 'border-red-400' },
  { label: 'Blue', color: '#3b82f6', border: 'border-blue-400' },
  { label: 'Green', color: '#10b981', border: 'border-emerald-400' },
  { label: 'Yellow', color: '#eab308', border: 'border-amber-400' },
  { label: 'Cyan', color: '#00f0ff', border: 'border-cyan-400' },
  { label: 'Violet', color: '#8b5cf6', border: 'border-purple-400' },
];

const BG_PRESETS: { id: WhiteboardBg; label: string; previewColor: string }[] = [
  { id: 'navy', label: 'Dark Navy', previewColor: '#050a1a' },
  { id: 'black', label: 'Pure Black', previewColor: '#000000' },
  { id: 'white', label: 'Whiteboard', previewColor: '#ffffff' },
  { id: 'lightGrey', label: 'Light Grey', previewColor: '#f1f5f9' },
  { id: 'grid', label: 'Square Grid', previewColor: '#081432' },
  { id: 'dots', label: 'Dotted Grid', previewColor: '#081432' },
  { id: 'cartesian', label: 'Cartesian Axes', previewColor: '#081432' },
];

export const SketchboardModule: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Boards State
  const [boards, setBoards] = useState<Whiteboard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('wb-default');

  // Tool Options
  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');

  // Separate Pen & Highlighter & Eraser Settings
  const [penColor, setPenColor] = useState<string>('#00f0ff');
  const [penSize, setPenSize] = useState<number>(4);

  const [highlighterColor, setHighlighterColor] = useState<string>('#eab308');
  const [highlighterSize, setHighlighterSize] = useState<number>(20);
  const [highlighterOpacity, setHighlighterOpacity] = useState<number>(0.35);

  const [eraserSize, setEraserSize] = useState<number>(24);
  const [polygonSides, setPolygonSides] = useState<number>(5);
  const [fontSize, setFontSize] = useState<number>(24);

  // Background Settings
  const [bgType, setBgType] = useState<WhiteboardBg>('cartesian');
  const [customBgColor, setCustomBgColor] = useState<string>('');

  // Drawing History & Undo/Redo
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeRef = useRef<CanvasStroke | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const dragStartPointRef = useRef<Point | null>(null);

  // Text Tool Dialog
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textInputVal, setTextInputVal] = useState<string>('');

  // Rename Board Modal
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  // Settings Panel Drawer Toggle
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('Saved');

  // Load Boards on mount
  useEffect(() => {
    storage.getWhiteboards().then((list) => {
      if (list && list.length > 0) {
        setBoards(list);
        const first = list[0];
        setActiveBoardId(first.id);
        setStrokes(first.strokes || []);
        setBgType(first.background || 'cartesian');
        if (first.customBgColor) setCustomBgColor(first.customBgColor);
      } else {
        const initialBoard: Whiteboard = {
          id: 'wb-default',
          name: 'Class 11 Classroom Whiteboard',
          updatedAt: Date.now(),
          background: 'cartesian',
          strokes: [],
        };
        setBoards([initialBoard]);
        storage.saveWhiteboard(initialBoard);
      }
    });
  }, []);

  // Save current board on strokes or background change (debounced)
  useEffect(() => {
    if (!activeBoardId) return;
    setSaveStatus('Saving...');
    const timeout = setTimeout(async () => {
      try {
        const currentBoard = boards.find((b) => b.id === activeBoardId);
        if (currentBoard) {
          const updated: Whiteboard = {
            ...currentBoard,
            strokes,
            background: bgType,
            customBgColor: customBgColor || undefined,
            updatedAt: Date.now(),
          };
          await storage.saveWhiteboard(updated);
          setBoards((prev) => prev.map((b) => (b.id === activeBoardId ? updated : b)));
          setSaveStatus('All changes saved');
        }
      } catch (e) {
        setSaveStatus('Storage error');
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [strokes, bgType, customBgColor, activeBoardId]);

  // Redraw Canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Determine background color
    let fill = '#050a1a'; // default navy
    if (customBgColor) {
      fill = customBgColor;
    } else if (bgType === 'black') {
      fill = '#000000';
    } else if (bgType === 'white') {
      fill = '#ffffff';
    } else if (bgType === 'lightGrey') {
      fill = '#f1f5f9';
    } else if (bgType === 'navy' || bgType === 'grid' || bgType === 'dots' || bgType === 'cartesian') {
      fill = '#050a1a';
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);

    const isLightBg = fill === '#ffffff' || fill === '#f1f5f9';
    const gridLineColor = isLightBg ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 240, 255, 0.08)';
    const dotColor = isLightBg ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 240, 255, 0.25)';
    const axisColor = isLightBg ? '#0284c7' : 'rgba(0, 240, 255, 0.6)';

    // 2. Draw chosen pattern without deleting strokes
    if (bgType === 'grid') {
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1;
      const step = 32;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (bgType === 'dots') {
      ctx.fillStyle = dotColor;
      const step = 28;
      for (let x = 14; x < width; x += step) {
        for (let y = 14; y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (bgType === 'cartesian') {
      const midX = Math.round(width / 2);
      const midY = Math.round(height / 2);

      // Minor grid
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = midX % step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = midY % step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Major axes
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 2;
      // X Axis
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      // Y Axis
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, height);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = axisColor;
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText('(0, 0)', midX + 8, midY + 16);
      ctx.fillText('+X →', width - 48, midY - 8);
      ctx.fillText('+Y ↑', midX + 8, 22);
    }

    // 3. Render strokes
    const allStrokes = currentStrokeRef.current
      ? [...strokes, currentStrokeRef.current]
      : strokes;

    for (const stroke of allStrokes) {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.globalAlpha = stroke.opacity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Text Stroke
      if (stroke.tool === 'text' && stroke.text && stroke.startPoint) {
        ctx.font = `bold ${stroke.fontSize || 24}px Inter, sans-serif`;
        ctx.fillText(stroke.text, stroke.startPoint.x, stroke.startPoint.y);
        ctx.restore();
        continue;
      }

      // Shape rendering
      if (
        stroke.startPoint &&
        stroke.endPoint &&
        ['line', 'arrow', 'rect', 'roundedRect', 'circle', 'ellipse', 'triangle', 'polygon'].includes(stroke.tool)
      ) {
        const { startPoint, endPoint } = stroke;

        if (stroke.tool === 'line') {
          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(endPoint.x, endPoint.y);
          ctx.stroke();
        } else if (stroke.tool === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(endPoint.x, endPoint.y);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
          const headLen = Math.max(12, stroke.size * 2.8);
          ctx.beginPath();
          ctx.moveTo(endPoint.x, endPoint.y);
          ctx.lineTo(
            endPoint.x - headLen * Math.cos(angle - Math.PI / 6),
            endPoint.y - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            endPoint.x - headLen * Math.cos(angle + Math.PI / 6),
            endPoint.y - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        } else if (stroke.tool === 'rect') {
          const rx = Math.min(startPoint.x, endPoint.x);
          const ry = Math.min(startPoint.y, endPoint.y);
          const rw = Math.abs(endPoint.x - startPoint.x);
          const rh = Math.abs(endPoint.y - startPoint.y);
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (stroke.tool === 'roundedRect') {
          const rx = Math.min(startPoint.x, endPoint.x);
          const ry = Math.min(startPoint.y, endPoint.y);
          const rw = Math.abs(endPoint.x - startPoint.x);
          const rh = Math.abs(endPoint.y - startPoint.y);
          const radius = Math.min(16, rw / 2, rh / 2);
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, radius);
          ctx.stroke();
        } else if (stroke.tool === 'circle') {
          const rx = (startPoint.x + endPoint.x) / 2;
          const ry = (startPoint.y + endPoint.y) / 2;
          const rad = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) / 2;
          ctx.beginPath();
          ctx.arc(rx, ry, rad, 0, Math.PI * 2);
          ctx.stroke();
        } else if (stroke.tool === 'ellipse') {
          const rx = (startPoint.x + endPoint.x) / 2;
          const ry = (startPoint.y + endPoint.y) / 2;
          const radX = Math.abs(endPoint.x - startPoint.x) / 2;
          const radY = Math.abs(endPoint.y - startPoint.y) / 2;
          ctx.beginPath();
          ctx.ellipse(rx, ry, radX, radY, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (stroke.tool === 'triangle') {
          ctx.beginPath();
          ctx.moveTo((startPoint.x + endPoint.x) / 2, startPoint.y);
          ctx.lineTo(endPoint.x, endPoint.y);
          ctx.lineTo(startPoint.x, endPoint.y);
          ctx.closePath();
          ctx.stroke();
        } else if (stroke.tool === 'polygon') {
          const cx = (startPoint.x + endPoint.x) / 2;
          const cy = (startPoint.y + endPoint.y) / 2;
          const radius = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) / 2;
          const sides = stroke.polygonSides || 5;
          ctx.beginPath();
          for (let i = 0; i < sides; i++) {
            const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
            const px = cx + radius * Math.cos(a);
            const py = cy + radius * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      } else if (stroke.points && stroke.points.length > 0) {
        // Freehand path (pen, pencil, highlighter, eraser)
        if (stroke.tool === 'eraser') {
          // Fill with current background color to cleanly erase on any background
          ctx.strokeStyle = fill;
          ctx.lineWidth = stroke.size;
        }

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, [strokes, bgType, customBgColor]);

  // Resize handling without stretching drawings
  const handleResize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Pointer coordinate calculation
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const point = getCanvasPoint(e);
    setIsDrawing(true);

    // Text tool: opens in-place text input
    if (activeTool === 'text') {
      setTextInputPos(point);
      setTextInputVal('');
      return;
    }

    // Select/Move tool
    if (activeTool === 'select') {
      dragStartPointRef.current = point;
      const found = strokes.slice().reverse().find((st) => {
        if (st.points && st.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 25)) return true;
        if (st.startPoint && Math.hypot(st.startPoint.x - point.x, st.startPoint.y - point.y) < 30) return true;
        return false;
      });
      setSelectedStrokeId(found ? found.id : null);
      return;
    }

    const isShape = ['line', 'arrow', 'rect', 'roundedRect', 'circle', 'ellipse', 'triangle', 'polygon'].includes(activeTool);
    const strokeSize = activeTool === 'highlighter' ? highlighterSize : activeTool === 'eraser' ? eraserSize : penSize;
    const strokeColor = activeTool === 'highlighter' ? highlighterColor : penColor;
    const strokeOpacity = activeTool === 'highlighter' ? highlighterOpacity : activeTool === 'pencil' ? 0.75 : 1.0;

    currentStrokeRef.current = {
      id: `str-${Date.now()}`,
      tool: activeTool,
      color: strokeColor,
      size: strokeSize,
      opacity: strokeOpacity,
      points: [point],
      startPoint: isShape ? point : undefined,
      endPoint: isShape ? point : undefined,
      polygonSides: activeTool === 'polygon' ? polygonSides : undefined,
    };
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);

    if (activeTool === 'select' && selectedStrokeId && dragStartPointRef.current) {
      const dx = point.x - dragStartPointRef.current.x;
      const dy = point.y - dragStartPointRef.current.y;
      dragStartPointRef.current = point;

      setStrokes((prev) =>
        prev.map((s) => {
          if (s.id !== selectedStrokeId) return s;
          return {
            ...s,
            points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            startPoint: s.startPoint ? { x: s.startPoint.x + dx, y: s.startPoint.y + dy } : undefined,
            endPoint: s.endPoint ? { x: s.endPoint.x + dx, y: s.endPoint.y + dy } : undefined,
          };
        })
      );
      return;
    }

    if (!currentStrokeRef.current) return;

    const stroke = currentStrokeRef.current;
    if (['line', 'arrow', 'rect', 'roundedRect', 'circle', 'ellipse', 'triangle', 'polygon'].includes(stroke.tool)) {
      stroke.endPoint = point;
    } else {
      stroke.points.push(point);
    }
    redrawCanvas();
  };

  // Pointer Up / Cancel
  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current) {
      const finished = currentStrokeRef.current;
      setStrokes((prev) => [...prev, finished]);
      setRedoStack([]);
      currentStrokeRef.current = null;
    }
    dragStartPointRef.current = null;
  };

  // Confirm Text Placement
  const handleCommitText = () => {
    if (!textInputPos || !textInputVal.trim()) {
      setTextInputPos(null);
      return;
    }

    audioFX.playClick();
    const textStroke: CanvasStroke = {
      id: `text-${Date.now()}`,
      tool: 'text',
      color: penColor,
      size: 2,
      opacity: 1,
      points: [textInputPos],
      startPoint: textInputPos,
      endPoint: textInputPos,
      text: textInputVal.trim(),
      fontSize,
    };

    setStrokes((prev) => [...prev, textStroke]);
    setRedoStack([]);
    setTextInputPos(null);
    setTextInputVal('');
  };

  // Undo / Redo
  const handleUndo = () => {
    if (strokes.length === 0) return;
    audioFX.playClick();
    const last = strokes[strokes.length - 1];
    setStrokes((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    audioFX.playClick();
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setStrokes((prev) => [...prev, next]);
  };

  // Clear All on Current Board with confirmation
  const handleClearAll = () => {
    if (strokes.length === 0) return;
    const confirmClear = window.confirm(
      'Are you sure you want to clear all drawings from this whiteboard? This cannot be undone.'
    );
    if (!confirmClear) return;

    audioFX.playClick();
    setStrokes([]);
    setRedoStack([]);
  };

  // Export PNG
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    audioFX.playClick();

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `ClassOS_${currentBoard.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    audioFX.playSuccess();
  };

  // Board Management: Create, Switch, Rename, Delete
  const handleCreateBoard = () => {
    audioFX.playClick();
    const newBoard: Whiteboard = {
      id: `wb-${Date.now()}`,
      name: `Whiteboard ${boards.length + 1}`,
      updatedAt: Date.now(),
      background: bgType,
      customBgColor,
      strokes: [],
    };
    const updated = [...boards, newBoard];
    setBoards(updated);
    setActiveBoardId(newBoard.id);
    setStrokes([]);
    setRedoStack([]);
    storage.saveWhiteboard(newBoard);
  };

  const handleSwitchBoard = (id: string) => {
    if (id === activeBoardId) return;
    audioFX.playClick();
    const target = boards.find((b) => b.id === id);
    if (target) {
      setActiveBoardId(target.id);
      setStrokes(target.strokes || []);
      setBgType(target.background || 'cartesian');
      setCustomBgColor(target.customBgColor || '');
      setRedoStack([]);
    }
  };

  const handleRenameBoard = () => {
    if (!renameInput.trim()) return;
    audioFX.playClick();
    const updated = boards.map((b) =>
      b.id === activeBoardId ? { ...b, name: renameInput.trim(), updatedAt: Date.now() } : b
    );
    setBoards(updated);
    const target = updated.find((b) => b.id === activeBoardId);
    if (target) storage.saveWhiteboard(target);
    setIsRenameOpen(false);
  };

  const handleDeleteBoard = (id: string) => {
    if (boards.length <= 1) {
      alert('Cannot delete the only remaining classroom whiteboard.');
      return;
    }
    const target = boards.find((b) => b.id === id);
    const confirmDel = window.confirm(`Are you sure you want to delete "${target?.name || 'this board'}"?`);
    if (!confirmDel) return;

    audioFX.playClick();
    const filtered = boards.filter((b) => b.id !== id);
    setBoards(filtered);
    storage.deleteWhiteboard(id);
    if (activeBoardId === id) {
      setActiveBoardId(filtered[0].id);
      setStrokes(filtered[0].strokes || []);
      setBgType(filtered[0].background || 'cartesian');
      setCustomBgColor(filtered[0].customBgColor || '');
    }
  };

  const currentBoard = boards.find((b) => b.id === activeBoardId) || boards[0];

  return (
    <div
      className={`flex flex-col gap-3 animate-in fade-in ${
        isFullScreen ? 'fixed inset-0 z-50 bg-[#040814] p-3' : 'h-[calc(100vh-140px)] min-h-[620px]'
      }`}
    >
      {/* Top Controls Bar: Boards List & Essential Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl jarvis-panel border border-cyan-500/30 text-xs">
        {/* Left: Named Boards Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full sm:max-w-xl scrollbar-none">
          {boards.map((b) => (
            <div
              key={b.id}
              onClick={() => handleSwitchBoard(b.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-hud font-bold cursor-pointer whitespace-nowrap transition ${
                b.id === activeBoardId
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>{b.name}</span>
              {b.id === activeBoardId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameInput(b.name);
                    setIsRenameOpen(true);
                  }}
                  className="p-0.5 text-slate-400 hover:text-cyan-300"
                  title="Rename board"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              )}
              {boards.length > 1 && b.id === activeBoardId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBoard(b.id);
                  }}
                  className="p-0.5 text-slate-500 hover:text-red-400"
                  title="Delete board"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <button
            onClick={handleCreateBoard}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200"
            title="Create new classroom board"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Board</span>
          </button>
        </div>

        {/* Right: Actions (Undo, Redo, Clear All, Export, Settings, Fullscreen) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono-code text-slate-400 hidden md:inline mr-1">
            {saveStatus}
          </span>

          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40 hover:text-white"
            title="Undo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40 hover:text-white"
            title="Redo"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/50 hover:text-white font-hud font-bold"
            title="Clear all drawings on current board"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CLEAR ALL</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-hud font-bold transition ${
              isSettingsOpen
                ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'bg-slate-900 border-slate-700 text-cyan-300 hover:border-cyan-500/40'
            }`}
            title="Tool & Canvas Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">SETTINGS</span>
          </button>

          <button
            onClick={handleExportPNG}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30 font-hud font-bold"
            title="Export high-resolution PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PNG</span>
          </button>

          <button
            onClick={() => {
              audioFX.playClick();
              setIsFullScreen(!isFullScreen);
            }}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Whiteboard'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Workspace (Tools Palette on Left + Canvas + Settings Drawer) */}
      <div className="flex-1 flex flex-col md:flex-row gap-2 relative min-h-0">
        {/* Left Toolbar: Drawing Tools & Shapes */}
        <div className="flex md:flex-col items-center gap-1.5 p-2 rounded-2xl jarvis-panel border border-cyan-500/30 overflow-x-auto md:overflow-y-auto max-h-full shrink-0">
          {/* Freehand Tools */}
          {[
            { id: 'pen' as DrawingTool, label: 'Pen', icon: PenTool },
            { id: 'pencil' as DrawingTool, label: 'Pencil', icon: Edit2 },
            { id: 'highlighter' as DrawingTool, label: 'Highlighter', icon: Highlighter },
            { id: 'eraser' as DrawingTool, label: 'Eraser', icon: Eraser },
            { id: 'text' as DrawingTool, label: 'Text Insertion', icon: Type },
            { id: 'select' as DrawingTool, label: 'Select / Move', icon: MousePointer },
          ].map((tool) => {
            const Icon = tool.icon;
            const isSel = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  audioFX.playClick();
                  setActiveTool(tool.id);
                }}
                title={tool.label}
                className={`p-2.5 rounded-xl transition ${
                  isSel
                    ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.6)] font-bold'
                    : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}

          <div className="w-px h-5 md:w-5 md:h-px bg-cyan-500/20 my-0.5" />

          {/* Shapes Tools */}
          {[
            { id: 'line' as DrawingTool, label: 'Straight Line', icon: Minus },
            { id: 'arrow' as DrawingTool, label: 'Directional Arrow', icon: MoveRight },
            { id: 'rect' as DrawingTool, label: 'Rectangle', icon: Square },
            { id: 'roundedRect' as DrawingTool, label: 'Rounded Rectangle', icon: Square },
            { id: 'circle' as DrawingTool, label: 'Circle', icon: CircleIcon },
            { id: 'ellipse' as DrawingTool, label: 'Ellipse', icon: CircleIcon },
            { id: 'triangle' as DrawingTool, label: 'Triangle', icon: Triangle },
            { id: 'polygon' as DrawingTool, label: `Polygon (${polygonSides} sides)`, icon: Hexagon },
          ].map((shape) => {
            const Icon = shape.icon;
            const isSel = activeTool === shape.id;
            return (
              <button
                key={shape.id}
                onClick={() => {
                  audioFX.playClick();
                  setActiveTool(shape.id);
                }}
                title={shape.label}
                className={`p-2.5 rounded-xl transition ${
                  isSel
                    ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.6)] font-bold'
                    : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Canvas Workspace Area */}
        <div
          ref={containerRef}
          className="flex-1 relative rounded-2xl overflow-hidden border border-cyan-500/40 shadow-inner bg-[#050a1a]"
          style={{ touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full h-full cursor-crosshair block select-none"
            style={{ touchAction: 'none' }}
          />

          {/* In-place Text Insertion Dialog */}
          {textInputPos && (
            <div
              className="absolute z-20 bg-slate-950/95 border border-cyan-400 p-2.5 rounded-xl shadow-2xl flex items-center gap-2"
              style={{
                left: Math.min(window.innerWidth - 320, Math.max(10, textInputPos.x)),
                top: Math.max(10, textInputPos.y - 45),
              }}
            >
              <input
                type="text"
                autoFocus
                value={textInputVal}
                onChange={(e) => setTextInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitText();
                  if (e.key === 'Escape') setTextInputPos(null);
                }}
                placeholder="Type text & hit Enter..."
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-sans text-sm border border-cyan-500/30 outline-none w-48"
              />
              <button
                onClick={handleCommitText}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500 text-black font-bold text-xs"
              >
                Place
              </button>
              <button
                onClick={() => setTextInputPos(null)}
                className="text-slate-400 hover:text-white px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Color & Size Floating Bar at Bottom */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-2xl bg-slate-950/90 border border-cyan-500/40 backdrop-blur-md shadow-2xl">
            {/* Color Presets */}
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((p) => {
                const currentColor = activeTool === 'highlighter' ? highlighterColor : penColor;
                const isSelected = currentColor.toLowerCase() === p.color.toLowerCase();
                return (
                  <button
                    key={p.color}
                    onClick={() => {
                      audioFX.playClick();
                      if (activeTool === 'highlighter') {
                        setHighlighterColor(p.color);
                      } else {
                        setPenColor(p.color);
                      }
                    }}
                    className={`w-5 h-5 rounded-full transition-transform border ${p.border} ${
                      isSelected ? 'scale-125 ring-2 ring-cyan-400 ring-offset-1 ring-offset-black' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: p.color }}
                    title={p.label}
                  />
                );
              })}

              {/* Custom Color Picker */}
              <label
                className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center cursor-pointer hover:border-cyan-400"
                title="Custom Color"
              >
                <Palette className="w-3 h-3 text-slate-300" />
                <input
                  type="color"
                  value={activeTool === 'highlighter' ? highlighterColor : penColor}
                  onChange={(e) => {
                    if (activeTool === 'highlighter') {
                      setHighlighterColor(e.target.value);
                    } else {
                      setPenColor(e.target.value);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <div className="w-px h-5 bg-slate-700 mx-1" />

            {/* Thickness / Size Quick Selector */}
            <div className="flex items-center gap-1 text-[11px] font-mono-code text-cyan-300">
              <span className="text-slate-400">Size:</span>
              <strong className="w-6 text-center">
                {activeTool === 'highlighter'
                  ? `${highlighterSize}px`
                  : activeTool === 'eraser'
                  ? `${eraserSize}px`
                  : `${penSize}px`}
              </strong>
            </div>
          </div>
        </div>

        {/* Slide-out Tool & Canvas Settings Drawer */}
        {isSettingsOpen && (
          <div className="w-full md:w-72 p-4 rounded-2xl jarvis-panel border border-cyan-500/40 shrink-0 space-y-4 overflow-y-auto max-h-full animate-in slide-in-from-right-4">
            <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-cyan-400" />
                <h4 className="font-hud font-bold text-xs text-white uppercase">
                  Whiteboard Settings
                </h4>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pen Thickness Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono-code mb-1">
                <span className="text-slate-300">Pen Thickness</span>
                <span className="text-cyan-400 font-bold">{penSize}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="36"
                value={penSize}
                onChange={(e) => setPenSize(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Highlighter Thickness & Opacity */}
            <div className="pt-2 border-t border-cyan-500/10 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono-code mb-1">
                <span className="text-slate-300">Highlighter Width</span>
                <span className="text-amber-400 font-bold">{highlighterSize}px</span>
              </div>
              <input
                type="range"
                min="8"
                max="60"
                value={highlighterSize}
                onChange={(e) => setHighlighterSize(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />

              <div className="flex items-center justify-between text-xs font-mono-code mb-1">
                <span className="text-slate-300">Highlighter Opacity</span>
                <span className="text-amber-400 font-bold">{Math.round(highlighterOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="0.75"
                step="0.05"
                value={highlighterOpacity}
                onChange={(e) => setHighlighterOpacity(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* Eraser Width */}
            <div className="pt-2 border-t border-cyan-500/10">
              <div className="flex items-center justify-between text-xs font-mono-code mb-1">
                <span className="text-slate-300">Eraser Size</span>
                <span className="text-cyan-400 font-bold">{eraserSize}px</span>
              </div>
              <input
                type="range"
                min="8"
                max="80"
                value={eraserSize}
                onChange={(e) => setEraserSize(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Polygon Sides (When polygon tool selected or configured) */}
            <div className="pt-2 border-t border-cyan-500/10">
              <div className="flex items-center justify-between text-xs font-mono-code mb-1">
                <span className="text-slate-300">Polygon Sides</span>
                <span className="text-purple-400 font-bold">{polygonSides} sides</span>
              </div>
              <input
                type="range"
                min="3"
                max="10"
                value={polygonSides}
                onChange={(e) => setPolygonSides(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>

            {/* Canvas Background Settings */}
            <div className="pt-2 border-t border-cyan-500/10 space-y-2">
              <span className="block text-xs font-mono-code text-cyan-300 uppercase font-bold">
                Canvas Background
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                {BG_PRESETS.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => {
                      audioFX.playClick();
                      setBgType(bg.id);
                      setCustomBgColor('');
                    }}
                    className={`p-2 rounded-lg border text-[11px] font-mono-code text-left flex items-center gap-1.5 transition ${
                      bgType === bg.id && !customBgColor
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0"
                      style={{ backgroundColor: bg.previewColor }}
                    />
                    <span className="truncate">{bg.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom BG Color picker */}
              <div className="flex items-center justify-between pt-1 text-xs font-mono-code">
                <span className="text-slate-400">Custom BG Color:</span>
                <input
                  type="color"
                  value={customBgColor || '#050a1a'}
                  onChange={(e) => setCustomBgColor(e.target.value)}
                  className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rename Board Modal */}
      {isRenameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl jarvis-panel border border-cyan-500/40 p-5 space-y-3 shadow-2xl">
            <h4 className="font-hud font-bold text-sm text-white uppercase">
              Rename Whiteboard
            </h4>
            <input
              type="text"
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameBoard();
                if (e.key === 'Escape') setIsRenameOpen(false);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-cyan-500/30 text-white text-xs outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRenameOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameBoard}
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
