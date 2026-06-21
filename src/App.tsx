// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  Settings, 
  Terminal, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle,
  Info,
  Database,
  Search,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw
} from 'lucide-react';
import { ThreeDPreview } from './components/ThreeDPreview';

interface Log {
  timestamp: string;
  level: string;
  message: string;
}

interface LibOption {
  name: string;
  uri: string;
  type: string;
}

interface ComponentRecord {
  name: string;
  manufacturer: string;
  mpn: string;
  package: string;
  source: string;
  version: string;
  importDate: string;
  checksum: string;
  datasheet: string;
  aliases: string[];
  symbolLib: string;
  footprintLib: string;
  symbolFile: string;
  footprintFile: string;
  modelFile: string;
}

interface UploadedPart {
  file: File;
  result: any;
  newName: string;
  manufacturer: string;
  mpn: string;
  packageName: string;
  datasheet: string;
  aliases: string;
  sourceSite: string;
  offset: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

const ORANGE = "#ff5500";
const GREEN = "#44ff88";

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function FieldLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span
        className="text-[10px] font-bold tabular-nums font-mono"
        style={{ color: ORANGE }}
      >
        {String(n).padStart(2, "0")}.
      </span>
      <span
        className="text-[10px] uppercase tracking-widest font-mono text-[#666]"
      >
        {label}
      </span>
    </div>
  );
}

interface TEInputProps {
  placeholder?: string;
  value?: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}

function TEInput({ placeholder, value, readOnly, onChange }: TEInputProps) {
  return (
    <input
      className="w-full text-[11px] px-2.5 py-1.5 border outline-none transition-colors"
      style={{
        fontFamily: "IBM Plex Mono, monospace",
        background: "#0d0d0d",
        borderColor: "#2a2a2a",
        color: "#ddd8cc",
        borderRadius: "3px",
      }}
      placeholder={placeholder}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={(e) => (e.currentTarget.style.borderColor = ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
    />
  );
}

interface TESelectProps {
  value: string;
  options: { value: string; label: string }[] | string[];
  onChange?: (v: string) => void;
}

function TESelect({ value, options, onChange }: TESelectProps) {
  return (
    <div className="relative">
      <select
        className="w-full text-[11px] px-2.5 py-1.5 border outline-none appearance-none cursor-pointer"
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          background: "#0d0d0d",
          borderColor: "#2a2a2a",
          color: value ? "#ddd8cc" : "#444",
          borderRadius: "3px",
          paddingRight: "20px"
        }}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e) => (e.currentTarget.style.borderColor = ORANGE)}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
      >
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return (
            <option key={val} value={val} style={{ background: "#0d0d0d", color: "#ddd8cc" }}>
              {lbl}
            </option>
          );
        })}
      </select>
      <ChevronRight
        size={10}
        className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none text-[#444]"
      />
    </div>
  );
}

interface PreviewPanelProps {
  label: string;
  sublabel?: string;
  children?: React.ReactNode;
}

function PreviewPanel({ label, sublabel, children }: PreviewPanelProps) {
  return (
    <div
      className="flex-1 flex flex-col border overflow-hidden"
      style={{ borderColor: "#2a2a2a", borderRadius: "4px 0 4px 4px", height: "220px" }}
    >
      <div
        className="px-2.5 py-1.5 border-b"
        style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
      >
        <div className="flex justify-between items-center gap-2">
          <span
            className="text-[9px] uppercase tracking-wider leading-tight text-[#555] font-mono"
          >
            {label}
          </span>
          {sublabel && (
            <span
              className="text-[9px] leading-tight text-right truncate max-w-[220px] text-[#444] font-mono"
              title={sublabel}
            >
              {sublabel}
            </span>
          )}
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden relative"
        style={{ background: "#080808" }}
      >
        {children}
      </div>
    </div>
  );
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'importer' | 'database'>('importer');
  
  // State variables
  const [dragActive, setDragActive] = useState(false);
  const [parts, setParts] = useState<UploadedPart[]>([]);
  const [activePartIndex, setActivePartIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Import Target Options
  const [targetSymbolLib, setTargetSymbolLib] = useState('');
  const [targetFootprintLib, setTargetFootprintLib] = useState('');
  const [target3DDir, setTarget3DDir] = useState('');
  
  // Lists loaded from API
  const [symbolLibs, setSymbolLibs] = useState<LibOption[]>([]);
  const [footprintLibs, setFootprintLibs] = useState<LibOption[]>([]);
  const [dbItems, setDbItems] = useState<ComponentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive Cross-Probing
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  
  // Database Expanded Row Track
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Settings & System Logs
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [config, setConfig] = useState({
    kicadPrefsDir: '',
    customSymbolLib: '',
    customFootprintLib: '',
    custom3DDir: ''
  });
  const [customConfig, setCustomConfig] = useState({ ...config });
  
  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SVG Pan & Zoom states
  const [symScale, setSymScale] = useState(1);
  const [symOffset, setSymOffset] = useState({ x: 0, y: 0 });
  const [symIsDragging, setSymIsDragging] = useState(false);
  const [symDragStart, setSymDragStart] = useState({ x: 0, y: 0 });

  const [fpScale, setFpScale] = useState(1);
  const [fpOffset, setFpOffset] = useState({ x: 0, y: 0 });
  const [fpIsDragging, setFpIsDragging] = useState(false);
  const [fpDragStart, setFpDragStart] = useState({ x: 0, y: 0 });

  const activePart = parts[activePartIndex];

  const updateActivePart = (updates: Partial<UploadedPart>) => {
    setParts(prev => prev.map((p, idx) => idx === activePartIndex ? { ...p, ...updates } : p));
  };

  const getValidationReport = (part: UploadedPart | undefined) => {
    if (!part) return null;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!part.newName.trim()) {
      errors.push("Component name is required.");
    } else if (!/^[A-Za-z0-9_\-\.]+$/.test(part.newName)) {
      errors.push("Component name contains invalid characters. Use alphanumeric, dashes, and underscores.");
    }

    const res = part.result;
    // Pin pad checks
    if (res && res.symbol && res.symbol.symbols && res.symbol.symbols[0] && res.footprint && res.footprint.pads) {
      const pinNums = new Set(res.symbol.symbols[0].pins.map((p: any) => String(p.number)));
      const padNums = new Set(res.footprint.pads.map((p: any) => String(p.number)));

      const pinsWithoutPads = [...pinNums].filter(p => !padNums.has(p));
      const padsWithoutPins = [...padNums].filter(p => !pinNums.has(p) && p !== 'MP' && p !== 'SH');

      if (pinsWithoutPads.length > 0) {
        warnings.push(`Pin mapping: Symbol has pin(s) [${pinsWithoutPads.join(', ')}] which are missing from the footprint.`);
      }
      if (padsWithoutPins.length > 0) {
        warnings.push(`Pin mapping: Footprint has pad(s) [${padsWithoutPins.join(', ')}] which are missing from the symbol pins.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };

  // Initialize and load configurations
  useEffect(() => {
    fetchConfig();
    fetchLibraries();
    fetchLogs();
    fetchComponents();
    
    // Poll logs every 2 seconds
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showLogs && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  useEffect(() => {
    setSymScale(1);
    setSymOffset({ x: 0, y: 0 });
    setFpScale(1);
    setFpOffset({ x: 0, y: 0 });
  }, [activePartIndex]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('http://localhost:3010/api/kicad/config');
      const data = await res.json();
      setConfig(data);
      setCustomConfig(data);
      setTarget3DDir(data.custom3DDir);
    } catch (e) {
      console.error('Error fetching config:', e);
    }
  };

  const fetchLibraries = async () => {
    try {
      const res = await fetch('http://localhost:3010/api/kicad/libraries');
      const data = await res.json();
      setSymbolLibs(data.symbolLibs || []);
      setFootprintLibs(data.footprintLibs || []);
      
      // Auto select defaults
      if (data.symbolLibs && data.symbolLibs.length > 0) {
        setTargetSymbolLib(data.symbolLibs[0].uri);
      }
      if (data.footprintLibs && data.footprintLibs.length > 0) {
        setTargetFootprintLib(data.footprintLibs[0].uri);
      }
    } catch (e) {
      console.error('Error fetching libraries:', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:3010/api/logs');
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
  };

  const fetchComponents = async (query = '') => {
    try {
      const url = query 
        ? `http://localhost:3010/api/components?q=${encodeURIComponent(query)}`
        : 'http://localhost:3010/api/components';
      const res = await fetch(url);
      const data = await res.json();
      setDbItems(data || []);
    } catch (e) {
      console.error('Error fetching components:', e);
    }
  };

  const saveConfig = async () => {
    try {
      const res = await fetch('http://localhost:3010/api/kicad/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setShowSettings(false);
        setSuccessMsg('Settings updated successfully!');
        setTimeout(() => setSuccessMsg(null), 3000);
        fetchLibraries();
      }
    } catch (e) {
      setErrorMsg('Failed to update config settings.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (selectedFiles: File[]) => {
    const zipFiles = selectedFiles.filter(f => f.name.endsWith('.zip'));
    if (zipFiles.length === 0) {
      setErrorMsg('Please upload .zip component package files.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setParts([]);
    setActivePartIndex(0);

    const loadedParts: UploadedPart[] = [];
    let uploadErrors = '';

    for (const selectedFile of zipFiles) {
      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const response = await fetch('http://localhost:3010/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
          let pName = '';
          if (data.footprint && data.footprint.name) {
            pName = data.footprint.name;
          } else if (data.symbol && data.symbol.symbols && data.symbol.symbols[0]) {
            pName = data.symbol.symbols[0].name;
          } else {
            pName = selectedFile.name.replace('.zip', '');
          }
          
          pName = pName.replace(/[\s(){}[\]:]/g, '_');

          const m = data.footprint?.model;
          const partOffset = m ? { x: m.offset.x, y: m.offset.y, z: m.offset.z } : { x: 0, y: 0, z: 0 };
          const partRotate = m ? { x: m.rotate.x, y: m.rotate.y, z: m.rotate.z } : { x: 0, y: 0, z: 0 };
          const partScale = m ? { x: m.scale.x, y: m.scale.y, z: m.scale.z } : { x: 1, y: 1, z: 1 };

          loadedParts.push({
            file: selectedFile,
            result: data,
            newName: pName,
            manufacturer: '',
            mpn: pName,
            packageName: data.footprint?.name || '',
            datasheet: '',
            aliases: '',
            sourceSite: '',
            offset: partOffset,
            rotate: partRotate,
            scale: partScale
          });
        } else {
          uploadErrors += `Failed to parse ${selectedFile.name}: ${data.error || 'Unknown error'}. `;
        }
      } catch (e) {
        uploadErrors += `Error uploading ${selectedFile.name}. `;
      }
    }

    if (loadedParts.length > 0) {
      setParts(loadedParts);
      setActivePartIndex(0);
      fetchLogs();
    }
    setLoading(false);

    if (uploadErrors) {
      setErrorMsg(uploadErrors);
      setTimeout(() => setErrorMsg(null), 6000);
    }
  };

  const handleImport = async () => {
    const activePart = parts[activePartIndex];
    if (!activePart) return;

    const report = getValidationReport(activePart);
    if (!activePart.newName.trim()) {
      setErrorMsg('Component name is required.');
      return;
    }
    if (!activePart.sourceSite) {
      setErrorMsg('Source website selector is required. Please choose a Sourced Website (e.g. Ultra Librarian).');
      return;
    }
    if (report && !report.valid) {
      setErrorMsg(`Sanity check failed: ${report.errors.join(' ')}`);
      return;
    }

    setImporting(true);
    setErrorMsg(null);


    const payload = {
      tempDir: activePart.result.tempDir,
      symbolFile: activePart.result.symbolFile,
      footprintFile: activePart.result.footprintFile,
      modelFile: activePart.result.modelFile,
      newName: activePart.newName.trim(),
      sourceSite: activePart.sourceSite,
      targetSymbolLib,
      targetFootprintLib,
      target3DDir,
      offset: activePart.offset,
      rotate: activePart.rotate,
      scale: activePart.scale,
      metadata: {
        manufacturer: activePart.manufacturer,
        mpn: activePart.mpn,
        package: activePart.packageName || activePart.result.footprint?.name || 'Unknown',
        datasheet: activePart.datasheet,
        aliases: activePart.aliases
      }
    };

    try {
      const response = await fetch('http://localhost:3010/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSuccessMsg(`Component "${activePart.newName}" successfully imported and synchronized atomically!`);
        
        const nextParts = parts.filter((_, idx) => idx !== activePartIndex);
        setParts(nextParts);
        
        if (activePartIndex >= nextParts.length && nextParts.length > 0) {
          setActivePartIndex(nextParts.length - 1);
        } else if (nextParts.length === 0) {
          setActivePartIndex(0);
        }

        fetchLogs();
        fetchComponents();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg(data.error || 'Import validation failed.');
      }
    } catch (e) {
      setErrorMsg('Failed to execute import API.');
    } finally {
      setImporting(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    fetchComponents(q);
  };

  const clearLogs = async () => {
    try {
      await fetch('http://localhost:3010/api/logs/clear', { method: 'POST' });
      setLogs([]);
    } catch (e) {
      console.error(e);
    }
  };

  // SVG Render Helper for Symbols
  const renderSymbolSVG = () => {
    const result = activePart?.result;
    if (!result || !result.symbol || !result.symbol.symbols || result.symbol.symbols.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-[#555555] text-xs font-mono">
          <AlertCircle size={20} className="mb-2 text-[#ff3333]" />
          [NO_SYMBOL_DATA]
        </div>
      );
    }

    const sym = result.symbol.symbols[0];
    const pins = sym.pins || [];
    const graphics = sym.graphics || [];

    if (pins.length === 0 && graphics.length === 0) {
      return <div className="flex items-center justify-center h-full text-[#555555] font-mono">[EMPTY_SYMBOL_TEMPLATE]</div>;
    }

    let minX = -10, maxX = 10, minY = -10, maxY = 10;
    const points: {x: number, y: number}[] = [];
    
    pins.forEach((p: any) => {
      points.push({ x: p.x, y: p.y });
      const rad = (p.angle * Math.PI) / 180;
      const len = 2.54;
      points.push({ x: p.x + len * Math.cos(rad), y: p.y - len * Math.sin(rad) });
    });

    graphics.forEach((g: any) => {
      const type = g.type;
      const data = g.data;
      if (type === 'rectangle') {
        const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
        const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
        if (start && end) {
          points.push({ x: start[1], y: -start[2] });
          points.push({ x: end[1], y: -end[2] });
        }
      } else if (type === 'polyline') {
        const ptsNode = data.find((c: any) => Array.isArray(c) && c[0] === 'pts');
        if (ptsNode) {
          for (let k = 1; k < ptsNode.length; k++) {
            if (ptsNode[k][0] === 'xy') {
              points.push({ x: ptsNode[k][1], y: -ptsNode[k][2] });
            }
          }
        }
      } else if (type === 'circle') {
        const center = data.find((c: any) => Array.isArray(c) && c[0] === 'center');
        const radius = data.find((c: any) => Array.isArray(c) && c[0] === 'radius');
        if (center && radius) {
          const r = radius[1];
          points.push({ x: center[1] - r, y: -center[2] - r });
          points.push({ x: center[1] + r, y: -center[2] + r });
        }
      }
    });

    if (points.length > 0) {
      minX = Math.min(...points.map(p => p.x));
      maxX = Math.max(...points.map(p => p.x));
      minY = Math.min(...points.map(p => p.y));
      maxY = Math.max(...points.map(p => p.y));
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const padding = Math.max(w, h) * 0.15 + 3;

    const viewX = minX - padding;
    const viewY = minY - padding;
    const viewW = w + padding * 2;
    const viewH = h + padding * 2;

    const handleSymWheel = (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const mx = viewX + clickX * (viewW / rect.width);
      const my = viewY + clickY * (viewH / rect.height);
      
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      const newScale = Math.max(0.2, Math.min(20, symScale * factor));
      
      setSymOffset(prev => ({
        x: prev.x + (symScale - newScale) * mx,
        y: prev.y + (symScale - newScale) * my
      }));
      setSymScale(newScale);
    };

    const handleSymMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setSymIsDragging(true);
      setSymDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleSymMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!symIsDragging) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - symDragStart.x;
      const dy = e.clientY - symDragStart.y;
      
      const scaleX = viewW / rect.width;
      const scaleY = viewH / rect.height;
      
      setSymOffset(prev => ({
        x: prev.x + dx * scaleX,
        y: prev.y + dy * scaleY
      }));
      setSymDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleSymMouseUp = () => {
      setSymIsDragging(false);
    };

    const handleSymMouseLeave = () => {
      setSymIsDragging(false);
    };

    return (
      <svg 
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`} 
        className="w-full h-full bg-[#000000] border border-[#222222]" 
        style={{ overflow: 'hidden', cursor: symIsDragging ? 'grabbing' : 'grab' }}
        onWheel={handleSymWheel}
        onMouseDown={handleSymMouseDown}
        onMouseMove={handleSymMouseMove}
        onMouseUp={handleSymMouseUp}
        onMouseLeave={handleSymMouseLeave}
      >
        <defs>
          <pattern id="symGrid" width="2.54" height="2.54" patternUnits="userSpaceOnUse">
            <path d="M 2.54 0 L 0 0 0 2.54" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.08" />
          </pattern>
        </defs>
        
        <rect x={viewX} y={viewY} width={viewW} height={viewH} fill="#000000" />

        <g transform={`translate(${symOffset.x}, ${symOffset.y}) scale(${symScale})`}>
          <rect x={viewX - viewW * 10} y={viewY - viewH * 10} width={viewW * 21} height={viewH * 21} fill="url(#symGrid)" />

          {graphics.map((g: any, idx: number) => {
            const type = g.type;
            const data = g.data;

            if (type === 'rectangle') {
              const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
              const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
              if (!start || !end) return null;
              return (
                <rect 
                  key={idx} 
                  x={Math.min(start[1], end[1])} 
                  y={Math.min(-start[2], -end[2])} 
                  width={Math.abs(end[1] - start[1])} 
                  height={Math.abs(end[2] - start[2])} 
                  fill="rgba(255, 255, 255, 0.02)" 
                  stroke="#888888" 
                  strokeWidth="0.2" 
                />
              );
            } else if (type === 'polyline') {
              const ptsNode = data.find((c: any) => Array.isArray(c) && c[0] === 'pts');
              if (!ptsNode) return null;
              const pointsList = [];
              for (let k = 1; k < ptsNode.length; k++) {
                if (ptsNode[k][0] === 'xy') pointsList.push(`${ptsNode[k][1]},${-ptsNode[k][2]}`);
              }
              return <polygon key={idx} points={pointsList.join(' ')} fill="none" stroke="#888888" strokeWidth="0.2" />;
            } else if (type === 'circle') {
              const center = data.find((c: any) => Array.isArray(c) && c[0] === 'center');
              const radius = data.find((c: any) => Array.isArray(c) && c[0] === 'radius');
              if (!center || !radius) return null;
              return <circle key={idx} cx={center[1]} cy={-center[2]} r={radius[1]} fill="none" stroke="#aa5555" strokeWidth="0.2" />;
            }
            return null;
          })}

          {pins.map((pin: any, idx: number) => {
            const angleRad = (pin.angle * Math.PI) / 180;
            const pinLen = 2.54;
            const x1 = pin.x;
            const y1 = pin.y;
            const x2 = pin.x + pinLen * Math.cos(angleRad);
            const y2 = pin.y - pinLen * Math.sin(angleRad);
            const isHovered = hoveredPin === pin.number;

            return (
              <g key={idx}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isHovered ? "#00ff66" : "#666666"} strokeWidth={isHovered ? "0.35" : "0.18"} />
                <circle cx={x1} cy={y1} r="0.2" fill={isHovered ? "#00ff66" : "#ff3333"} />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 0.4} fill="#888888" fontSize="0.75" fontFamily="monospace" textAnchor="middle">{pin.number}</text>
                <text 
                  x={x2 + 0.4 * Math.cos(angleRad)} 
                  y={y2 - 0.4 * Math.sin(angleRad) + 0.25} 
                  fill={isHovered ? "#00ff66" : "#ffffff"} 
                  fontSize="0.8"
                  fontFamily="monospace"
                  textAnchor={Math.cos(angleRad) >= 0 ? "start" : "end"}
                >
                  {pin.name}
                </text>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="1.5" className="cursor-pointer" onMouseEnter={() => setHoveredPin(pin.number)} onMouseLeave={() => setHoveredPin(null)} />
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  // SVG Render Helper for Footprints
  const renderFootprintSVG = () => {
    const result = activePart?.result;
    if (!result || !result.footprint) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-[#555555] text-xs font-mono">
          <AlertCircle size={20} className="mb-2 text-[#ff3333]" />
          [NO_FOOTPRINT_DATA]
        </div>
      );
    }

    const pads = result.footprint.pads || [];
    const graphics = result.footprint.graphics || [];

    if (pads.length === 0 && graphics.length === 0) {
      return <div className="flex items-center justify-center h-full text-[#555555] font-mono">[EMPTY_FOOTPRINT_TEMPLATE]</div>;
    }

    let minX = -15, maxX = 15, minY = -15, maxY = 15;
    const points: {x: number, y: number}[] = [];

    pads.forEach((p: any) => {
      points.push({ x: p.x - p.w/2, y: p.y - p.h/2 });
      points.push({ x: p.x + p.w/2, y: p.y + p.h/2 });
    });

    graphics.forEach((g: any) => {
      const type = g.type;
      const data = g.data;
      if (type === 'fp_line') {
        const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
        const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
        if (start && end) {
          points.push({ x: start[1], y: start[2] });
          points.push({ x: end[1], y: end[2] });
        }
      } else if (type === 'fp_rect') {
        const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
        const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
        if (start && end) {
          points.push({ x: start[1], y: start[2] });
          points.push({ x: end[1], y: end[2] });
        }
      }
    });

    if (points.length > 0) {
      minX = Math.min(...points.map(p => p.x));
      maxX = Math.max(...points.map(p => p.x));
      minY = Math.min(...points.map(p => p.y));
      maxY = Math.max(...points.map(p => p.y));
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const padding = Math.max(w, h) * 0.15 + 2;

    const viewX = minX - padding;
    const viewY = minY - padding;
    const viewW = w + padding * 2;
    const viewH = h + padding * 2;

    const handleFpWheel = (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const mx = viewX + clickX * (viewW / rect.width);
      const my = viewY + clickY * (viewH / rect.height);
      
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      const newScale = Math.max(0.2, Math.min(20, fpScale * factor));
      
      setFpOffset(prev => ({
        x: prev.x + (fpScale - newScale) * mx,
        y: prev.y + (fpScale - newScale) * my
      }));
      setFpScale(newScale);
    };

    const handleFpMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setFpIsDragging(true);
      setFpDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleFpMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!fpIsDragging) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - fpDragStart.x;
      const dy = e.clientY - fpDragStart.y;
      
      const scaleX = viewW / rect.width;
      const scaleY = viewH / rect.height;
      
      setFpOffset(prev => ({
        x: prev.x + dx * scaleX,
        y: prev.y + dy * scaleY
      }));
      setFpDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleFpMouseUp = () => {
      setFpIsDragging(false);
    };

    const handleFpMouseLeave = () => {
      setFpIsDragging(false);
    };

    return (
      <svg 
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`} 
        className="w-full h-full bg-[#000000] border border-[#222222]" 
        style={{ overflow: 'hidden', cursor: fpIsDragging ? 'grabbing' : 'grab' }}
        onWheel={handleFpWheel}
        onMouseDown={handleFpMouseDown}
        onMouseMove={handleFpMouseMove}
        onMouseUp={handleFpMouseUp}
        onMouseLeave={handleFpMouseLeave}
      >
        <defs>
          <pattern id="fpGrid" width="1.0" height="1.0" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.04" fill="rgba(255, 255, 255, 0.05)" />
          </pattern>
        </defs>
        
        <rect x={viewX} y={viewY} width={viewW} height={viewH} fill="#000000" />

        <g transform={`translate(${fpOffset.x}, ${fpOffset.y}) scale(${fpScale})`}>
          <rect x={viewX - viewW * 10} y={viewY - viewH * 10} width={viewW * 21} height={viewH * 21} fill="url(#fpGrid)" />

          {graphics.map((g: any, idx: number) => {
            const type = g.type;
            const data = g.data;
            const layerNode = data.find((c: any) => Array.isArray(c) && c[0] === 'layer');
            const layer = layerNode ? layerNode[1] : '';
            
            let strokeColor = '#333333';
            if (layer.includes('SilkS')) strokeColor = '#aaaaaa';
            if (layer.includes('CrtYd')) strokeColor = '#444444';

            if (type === 'fp_line') {
              const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
              const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
              if (!start || !end) return null;
              return <line key={idx} x1={start[1]} y1={start[2]} x2={end[1]} y2={end[2]} stroke={strokeColor} strokeWidth="0.12" />;
            } else if (type === 'fp_rect') {
              const start = data.find((c: any) => Array.isArray(c) && c[0] === 'start');
              const end = data.find((c: any) => Array.isArray(c) && c[0] === 'end');
              if (!start || !end) return null;
              return (
                <rect 
                  key={idx} 
                  x={Math.min(start[1], end[1])} 
                  y={Math.min(start[2], end[2])} 
                  width={Math.abs(end[1] - start[1])} 
                  height={Math.abs(end[2] - start[2])} 
                  fill="none" 
                  stroke={strokeColor} 
                  strokeWidth="0.12" 
                />
              );
            }
            return null;
          })}

          {pads.map((pad: any, idx: number) => {
            const isHovered = hoveredPin === pad.number;
            let fill = 'rgba(255, 255, 255, 0.08)';
            if (pad.type === 'thru_hole') fill = 'rgba(0, 0, 0, 0.9)';

            return (
              <g key={idx} onMouseEnter={() => setHoveredPin(pad.number)} onMouseLeave={() => setHoveredPin(null)} className="cursor-pointer">
                {isHovered && (
                  <rect
                    x={pad.x - pad.w / 2 - 0.25}
                    y={pad.y - pad.h / 2 - 0.25}
                    width={pad.w + 0.5}
                    height={pad.h + 0.5}
                    rx={pad.shape === 'circle' ? (pad.w + 0.5)/2 : 0}
                    ry={pad.shape === 'circle' ? (pad.h + 0.5)/2 : 0}
                    fill="none"
                    stroke="#00ff66"
                    strokeWidth="0.25"
                    className="pulse-hover"
                    transform={`rotate(${pad.angle || 0}, ${pad.x}, ${pad.y})`}
                  />
                )}

                {pad.shape === 'circle' ? (
                  <circle cx={pad.x} cy={pad.y} r={pad.w / 2} fill={isHovered ? "rgba(0, 255, 102, 0.15)" : fill} stroke={isHovered ? "#00ff66" : "#666666"} strokeWidth="0.08" />
                ) : (
                  <rect
                    x={pad.x - pad.w / 2}
                    y={pad.y - pad.h / 2}
                    width={pad.w}
                    height={pad.h}
                    rx={0}
                    ry={0}
                    fill={isHovered ? "rgba(0, 255, 102, 0.15)" : fill}
                    stroke={isHovered ? "#00ff66" : "#666666"}
                    strokeWidth="0.08"
                    transform={`rotate(${pad.angle || 0}, ${pad.x}, ${pad.y})`}
                  />
                )}

                {pad.type === 'thru_hole' && <circle cx={pad.x} cy={pad.y} r={Math.min(pad.w, pad.h) * 0.25} fill="#000000" stroke="#666666" strokeWidth="0.08" />}
                <text 
                  x={pad.x} 
                  y={pad.y + Math.min(pad.w || 1, pad.h || 1) * 0.2} 
                  fill={isHovered ? "#00ff66" : "#aaaaaa"} 
                  fontSize={Math.min(pad.w || 1, pad.h || 1) * 0.7} 
                  fontFamily="monospace" 
                  fontWeight="bold" 
                  textAnchor="middle" 
                  className="select-none pointer-events-none"
                >
                  {pad.number}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  const activeReport = getValidationReport(activePart);

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#111111]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
      
      {/* HEADER NAVBAR */}
      <header
        className="flex items-center justify-between px-4 border-b w-full"
        style={{
          height: "40px",
          borderColor: "#2a2a2a",
          background: "#0d0d0d",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[13px] font-bold tracking-[0.2em] uppercase font-mono"
            style={{ color: "#ddd8cc" }}
          >
            PARTKIT
          </span>
        </div>

        {parts.length > 0 && activeTab === 'importer' && (
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] tabular-nums font-mono animate-pulse"
              style={{ color: "#555" }}
            >
              {activePartIndex + 1}/{parts.length}
            </span>
            
            <button
              onClick={() => setActivePartIndex(prev => (prev - 1 + parts.length) % parts.length)}
              disabled={parts.length <= 1}
              className="w-6 h-6 border flex items-center justify-center transition-colors hover:border-[#ff5500] hover:text-[#ff5500] disabled:opacity-30 disabled:hover:border-[#2a2a2a] disabled:hover:text-[#555]"
              style={{
                borderColor: "#2a2a2a",
                color: "#555",
                borderRadius: "3px 0 0 3px",
              }}
              title="Previous Part"
            >
              <ChevronLeft size={10} />
            </button>
            <button
              onClick={() => setActivePartIndex(prev => (prev + 1) % parts.length)}
              disabled={parts.length <= 1}
              className="w-6 h-6 border flex items-center justify-center transition-colors hover:border-[#ff5500] hover:text-[#ff5500] disabled:opacity-30 disabled:hover:border-[#2a2a2a] disabled:hover:text-[#555]"
              style={{
                borderColor: "#2a2a2a",
                color: "#555",
                borderRadius: "0 3px 3px 0",
                marginLeft: "-1px",
              }}
              title="Next Part"
            >
              <ChevronRight size={10} />
            </button>
            
            <div style={{ width: "1px", height: "20px", background: "#2a2a2a", margin: "0 4px" }} />
            
            <button
              onClick={() => {
                setParts([]);
                setActivePartIndex(0);
              }}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 disabled:cursor-not-allowed cursor-pointer border-none"
              style={{
                background: ORANGE,
                color: "#111",
                borderRadius: "2px 6px 2px 6px",
              }}
            >
              <Plus size={9} strokeWidth={3} />
              <span>add part</span>
            </button>

          </div>
        )}
      </header>

      {/* BODY CONTENT */}
      <main className="max-w-7xl mx-auto px-6 py-4 pb-16 flex flex-col gap-4 w-full flex-1">

        {/* NOTIFICATIONS */}
        {errorMsg && (
          <div 
            className="flex items-center gap-2.5 p-3 text-[11px] border uppercase shrink-0"
            style={{ borderColor: "#b84040", background: "#1a0a0a", color: "#b84040", borderRadius: "3px" }}
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>WARNING: {errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div 
            className="flex items-center gap-2.5 p-3 text-[11px] border uppercase shrink-0"
            style={{ borderColor: "#44ff88", background: "#0a1a0d", color: "#44ff88", borderRadius: "3px" }}
          >
            <CheckCircle size={14} className="shrink-0" />
            <span>SUCCESS: {successMsg}</span>
          </div>
        )}

        {/* SETTINGS MODULE */}
        {showSettings && (
          <div 
            className="border p-4 flex flex-col gap-4 bg-[#0d0d0d] shrink-0"
            style={{ borderColor: "#2a2a2a", borderRadius: "4px" }}
          >
            <div className="flex items-center gap-3 border-b border-[#2a2a2a] pb-2">
              <Settings size={14} style={{ color: ORANGE }} />
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ddd8cc] font-mono">
                SYSTEM KICAD INTEGRATION CONFIG
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel n={1} label="KiCad Preferences Folder (10.0)" />
                <TEInput 
                  value={customConfig.kicadPrefsDir} 
                  onChange={(val) => setCustomConfig({ ...customConfig, kicadPrefsDir: val })}
                />
              </div>
              <div>
                <FieldLabel n={2} label="Symbol Library Target (.kicad_sym)" />
                <TEInput 
                  value={customConfig.customSymbolLib} 
                  onChange={(val) => setCustomConfig({ ...customConfig, customSymbolLib: val })}
                />
              </div>
              <div>
                <FieldLabel n={3} label="Footprints Library Folder (.pretty)" />
                <TEInput 
                  value={customConfig.customFootprintLib} 
                  onChange={(val) => setCustomConfig({ ...customConfig, customFootprintLib: val })}
                />
              </div>
              <div>
                <FieldLabel n={4} label="3D Models Output Folder (.3dshapes)" />
                <TEInput 
                  value={customConfig.custom3DDir} 
                  onChange={(val) => setCustomConfig({ ...customConfig, custom3DDir: val })}
                />
              </div>
            </div>
            
            <div className="flex gap-2 justify-end mt-2">
              <button 
                onClick={() => setShowSettings(false)} 
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border transition-colors hover:border-[#555] font-mono bg-transparent"
                style={{ borderColor: "#2a2a2a", color: "#666", borderRadius: "3px" }}
              >
                Cancel
              </button>
              <button 
                onClick={saveConfig} 
                className="px-4 py-1.5 text-[10px] uppercase tracking-widest font-bold transition-all hover:brightness-110 font-mono"
                style={{ background: ORANGE, color: "#111", borderRadius: "2px 6px 2px 6px", border: "none", cursor: "pointer" }}
              >
                Save Config
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: IMPORTER DASHBOARD */}
        {activeTab === 'importer' && (
          <div className="flex flex-col gap-4">
            {/* DRAG AND DROP ZONE */}
            {!activePart && (
              <div 
                className="border flex flex-col items-center justify-center min-h-[220px] relative bg-[#080808] shrink-0"
                style={{ borderColor: "#2a2a2a", borderRadius: "4px" }}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".zip" multiple className="hidden" />
                <div 
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`drop-zone w-full max-w-2xl py-8 px-4 flex flex-col items-center justify-center gap-4 transition-all duration-300 ${dragActive ? 'active' : ''}`}
                  style={{ border: '1px dashed #2a2a2a', background: '#0d0d0d', cursor: 'pointer' }}
                >
                  <div className="w-12 h-12 border border-[#333] flex items-center justify-center text-[#555]">
                    {loading ? <Loader2 size={24} className="animate-spin text-[#ff5500]" /> : <UploadCloud size={24} />}
                  </div>
                  {loading ? (
                    <div className="text-center font-mono">
                      <p className="text-[#ddd8cc] font-bold text-sm">[PARSING_S_EXPRESSION_STRUCTURES]</p>
                      <p className="text-[10px] text-[#555] mt-1">[READING_ZIP_FOOTPRINTS_SYMBOLS_3D_SHAPES]</p>
                      <div className="w-48 h-1 bg-[#111] border border-[#2a2a2a] mx-auto mt-4 overflow-hidden relative">
                        <div className="absolute top-0 bottom-0 bg-[#ff5500] w-1/3 animate-pulse" style={{ left: '33%' }} />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center font-mono uppercase">
                      <p className="text-[#ddd8cc] font-bold text-sm">[DROP_COMPONENT_PACKAGE_ZIP_HERE]</p>
                      <p className="text-xs text-[#555] mt-1">OR CLICK TO BROWSE LOCAL FILES (.ZIP FORMAT ONLY)</p>
                      <div className="flex items-center gap-2 mt-6 justify-center text-[9px] text-[#444] w-fit mx-auto border border-[#2a2a2a] px-3 py-1.5">
                        <Info size={10} />
                        <span>KICAD_V6_OR_NEWER_SEXPRESSIONS_REQUIRED</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PREVIEW AREAS */}
            {activePart && (
              <div className="flex flex-col gap-4">
                
                {/* 3 PREVIEW SQUARES IN ONE ROW */}
                <div className="grid-3col">
                  
                  {/* Symbol Square */}
                  <PreviewPanel
                    label="[SYMBOL]"
                    sublabel={activePart.result.symbolFile ? activePart.result.symbolFile : 'N/A'}
                  >
                    {renderSymbolSVG()}
                  </PreviewPanel>

                  {/* Footprint Square */}
                  <PreviewPanel
                    label="[FOOTPRINT]"
                    sublabel={activePart.result.footprintFile ? activePart.result.footprintFile : 'N/A'}
                  >
                    {renderFootprintSVG()}
                  </PreviewPanel>

                  {/* 3D View Square */}
                  <PreviewPanel
                    label="[3D MODEL]"
                    sublabel={activePart.result.modelFile ? activePart.result.modelFile : 'NO_MODEL'}
                  >
                    <ThreeDPreview pads={activePart.result.footprint?.pads || []} offset={activePart.offset} rotate={activePart.rotate} scale={activePart.scale} />
                  </PreviewPanel>

                </div>


                {/* METADATA FORM PANEL */}
                {/* METADATA FORM PANEL */}
                <div
                  className="border flex flex-col mt-2 shrink-0 bg-[#0d0d0d]"
                  style={{ borderColor: "#2a2a2a", borderRadius: "0 4px 4px 4px" }}
                >
                  {/* Section header */}
                  <div
                    className="flex items-center gap-3 px-3 py-2 border-b"
                    style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
                  >
                    <div
                      className="w-4 h-4 flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "2px", color: ORANGE }}
                    >
                      ⊕
                    </div>
                    <span
                      className="text-[10px] font-bold tracking-[0.15em] uppercase font-mono"
                      style={{ color: "#ddd8cc" }}
                    >
                      COMPONENT METADATA
                    </span>
                  </div>

                  {/* Form grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">

                    {/* Row 1 */}
                    <div>
                      <FieldLabel n={1} label="Component Name *" />
                      <TEInput 
                        value={activePart.newName} 
                        onChange={(val) => updateActivePart({ newName: val.replace(/[\s(){}[\]:]/g, '_') })} 
                      />
                    </div>
                    <div>
                      <FieldLabel n={2} label="Sourced Website *" />
                      <TESelect 
                        value={activePart.sourceSite} 
                        onChange={(val) => updateActivePart({ sourceSite: val })}
                        options={[
                          { value: "", label: "-- SELECT SOURCE WEBSITE --" },
                          { value: "Ultra Librarian", label: "Ultra Librarian (Prioritized)" },
                          { value: "SnapEDA", label: "SnapEDA" },
                          { value: "SamacSys", label: "SamacSys" },
                          { value: "Octopart", label: "Octopart" },
                          { value: "Other", label: "Other" }
                        ]}
                      />
                    </div>

                    {/* Row 2 */}
                    <div>
                      <FieldLabel n={3} label="Manufacturer" />
                      <TEInput 
                        placeholder="e.g. STMicroelectronics" 
                        value={activePart.manufacturer} 
                        onChange={(val) => updateActivePart({ manufacturer: val })} 
                      />
                    </div>
                    <div>
                      <FieldLabel n={4} label="Manufacturer Part Number (MPN)" />
                      <TEInput 
                        placeholder="e.g. STM32F103C8T6" 
                        value={activePart.mpn} 
                        onChange={(val) => updateActivePart({ mpn: val })} 
                      />
                    </div>

                    {/* Row 3 */}
                    <div>
                      <FieldLabel n={5} label="Physical Package" />
                      <TEInput 
                        placeholder="e.g. LQFP-48" 
                        value={activePart.packageName} 
                        onChange={(val) => updateActivePart({ packageName: val })} 
                      />
                    </div>
                    <div>
                      <FieldLabel n={6} label="Datasheet URL" />
                      <TEInput 
                        placeholder="e.g. https://www.st.com/...pdf" 
                        value={activePart.datasheet} 
                        onChange={(val) => updateActivePart({ datasheet: val })} 
                      />
                    </div>

                    {/* Row 4 */}
                    <div>
                      <FieldLabel n={7} label="Target Symbol Library" />
                      <TESelect 
                        value={targetSymbolLib} 
                        onChange={setTargetSymbolLib}
                        options={symbolLibs.map(lib => ({ value: lib.uri, label: lib.name }))}
                      />
                    </div>
                    <div>
                      <FieldLabel n={8} label="Target Footprint Library" />
                      <TESelect 
                        value={targetFootprintLib} 
                        onChange={setTargetFootprintLib}
                        options={footprintLibs.map(lib => ({ value: lib.uri, label: lib.name }))}
                      />
                    </div>

                    {/* Row 5 - full width */}
                    <div className="col-span-2">
                      <FieldLabel n={9} label="Component Aliases (Comma-separated)" />
                      <TEInput 
                        placeholder="e.g. STM32F103" 
                        value={activePart.aliases} 
                        onChange={(val) => updateActivePart({ aliases: val })} 
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div
                    className="flex items-center justify-end gap-2 px-4 py-3 border-t"
                    style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
                  >
                    <button
                      onClick={() => {
                        setParts([]);
                        setActivePartIndex(0);
                      }} 
                      disabled={importing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border transition-colors hover:border-[#555] font-mono bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ borderColor: "#2a2a2a", color: "#666", borderRadius: "3px" }}
                    >
                      <RotateCcw size={9} />
                      clear_cancel
                    </button>
                    <button
                      onClick={handleImport} 
                      disabled={importing}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] uppercase tracking-widest font-bold transition-all hover:brightness-110 font-mono disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer"

                      style={{
                        background: ORANGE,
                        color: "#111",
                        borderRadius: "2px 6px 2px 6px",
                      }}
                    >
                      {importing ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-[#111]" />
                          <span>LOAD PART...</span>
                        </>
                      ) : (
                        <>
                          <span>LOAD PART</span>
                          <ArrowRight size={10} strokeWidth={3} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: LOCAL DATABASE BROWSER */}
        {activeTab === 'database' && (
          <div className="flex flex-col gap-4">
            {/* Search and Metadata Info */}
            <div 
              className="border p-3.5 flex flex-col md:flex-row gap-4 items-center justify-between bg-[#0d0d0d] shrink-0"
              style={{ borderColor: "#2a2a2a", borderRadius: "4px" }}
            >
              <div className="relative w-full md:max-w-md">
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={handleSearchChange}
                  placeholder="SEARCH INDEXED PARTS..."
                  className="w-full text-[11px] py-1.5 pl-9 pr-4 border outline-none transition-colors"
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    background: "#080808",
                    borderColor: "#2a2a2a",
                    color: "#ddd8cc",
                    borderRadius: "3px"
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ORANGE)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
                <Search size={14} className="absolute left-3 top-2 text-[#555]" />
              </div>
              
              <div 
                className="flex items-center gap-2 text-[10px] border px-3 py-1.5 bg-[#080808]"
                style={{ borderColor: "#2a2a2a", borderRadius: "3px", color: "#888" }}
              >
                <Database size={12} style={{ color: ORANGE }} />
                <span>PARTS_INDEXED: <span style={{ color: "#ddd8cc" }}>{dbItems.length}</span></span>
              </div>
            </div>

            {/* Component Database Table */}
            <div 
              className="border overflow-hidden bg-[#0d0d0d]"
              style={{ borderColor: "#2a2a2a", borderRadius: "4px" }}
            >
              {dbItems.length === 0 ? (
                <div className="p-12 text-center text-[#555] flex flex-col items-center justify-center gap-3 font-mono">
                  <Database size={24} className="text-[#333]" />
                  <div>
                    <p className="font-bold text-[#ddd8cc] uppercase">[INDEX_DATABASE_EMPTY]</p>
                    <p className="text-[10px] mt-1 text-[#444]">Imported components will be automatically indexed here.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-mono text-xs">
                    <thead>
                      <tr 
                        className="border-b text-[9px] font-bold tracking-wider text-[#555] uppercase"
                        style={{ borderColor: "#2a2a2a", background: "#080808" }}
                      >
                        <th className="py-2.5 px-4">Part Name</th>
                        <th className="py-2.5 px-4">Manufacturer</th>
                        <th className="py-2.5 px-4">Part Number (MPN)</th>
                        <th className="py-2.5 px-4">Package</th>
                        <th className="py-2.5 px-4">Source</th>
                        <th className="py-2.5 px-4">Import Date</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e]" style={{ color: "#ddd8cc" }}>
                      {dbItems.map((item, idx) => {
                        const isExpanded = expandedRow === item.name;
                        return (
                          <React.Fragment key={idx}>
                            {/* Main row */}
                            <tr 
                              onClick={() => setExpandedRow(isExpanded ? null : item.name)}
                              className={`hover:bg-[#151515] cursor-pointer transition-colors ${isExpanded ? 'bg-[#121212]' : ''}`}
                            >
                              <td className="py-2 px-4 text-white font-bold" style={{ color: ORANGE }}>{item.name}</td>
                              <td className="py-2 px-4">{item.manufacturer || '-'}</td>
                              <td className="py-2 px-4" style={{ color: "#aaa" }}>{item.mpn || '-'}</td>
                              <td className="py-2 px-4">{item.package || '-'}</td>
                              <td className="py-2 px-4">
                                <span 
                                  className="px-2 py-0.5 text-[9px] border"
                                  style={{ borderColor: "#2a2a2a", background: "#111", color: "#666" }}
                                >
                                  {item.source}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-[#555]">{new Date(item.importDate).toLocaleDateString()}</td>
                              <td className="py-2 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                {item.datasheet ? (
                                  <a 
                                    href={item.datasheet} target="_blank" rel="noopener noreferrer"
                                    className="border hover:border-white px-2 py-0.5 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider transition-colors"
                                    style={{ borderColor: "#2a2a2a", color: "#888", borderRadius: "3px" }}
                                  >
                                    <span>PDF</span>
                                    <ExternalLink size={10} />
                                  </a>
                                ) : (
                                  <span className="text-[#333]">-</span>
                                )}
                              </td>
                            </tr>
                            {/* Expanded Details Panel */}
                            {isExpanded && (
                              <tr className="bg-[#080808]">
                                <td colSpan={7} className="p-4 border-t" style={{ borderColor: "#2a2a2a" }}>
                                  <div className="grid-3col text-[10px]">
                                    
                                    {/* Left Details */}
                                    <div className="flex flex-col gap-2">
                                      <span className="font-bold text-[#555] uppercase tracking-widest text-[9px]">PART_RECORD_DETAILS</span>
                                      <div className="flex flex-col gap-1.5 bg-[#0d0d0d] p-3 border" style={{ borderColor: "#1e1e1e" }}>
                                        <div className="flex justify-between py-0.5 border-b" style={{ borderColor: "#151515" }}>
                                          <span className="text-[#444]">DB_ENTRY</span>
                                          <span className="text-white font-bold">{item.name}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b" style={{ borderColor: "#151515" }}>
                                          <span className="text-[#444]">CHECKSUM_SHA256</span>
                                          <span className="text-[#888] truncate max-w-[160px]" title={item.checksum}>{item.checksum || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                          <span className="text-[#444]">ALIASES</span>
                                          <span className="text-slate-300">{item.aliases && item.aliases.length > 0 ? item.aliases.join(', ') : 'NONE'}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Library associations */}
                                    <div className="flex flex-col gap-2">
                                      <span className="font-bold text-[#555] uppercase tracking-widest text-[9px]">KICAD_LIBRARY_LINKS</span>
                                      <div className="flex flex-col gap-1.5 bg-[#0d0d0d] p-3 border" style={{ borderColor: "#1e1e1e" }}>
                                        <div className="flex justify-between py-0.5 border-b" style={{ borderColor: "#151515" }}>
                                          <span className="text-[#444]">SYMBOL_LIB</span>
                                          <span className="text-slate-300">{item.symbolLib}.kicad_sym</span>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b" style={{ borderColor: "#151515" }}>
                                          <span className="text-[#444]">FOOTPRINT_LIB</span>
                                          <span className="text-slate-300">{item.footprintLib}.pretty</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                          <span className="text-[#444]">3D_MODEL</span>
                                          <span className="text-[#888] truncate max-w-[160px]">{item.modelFile ? item.modelFile.split('/').pop() : 'NONE'}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Absolute File Paths */}
                                    <div className="flex flex-col gap-2">
                                      <span className="font-bold text-[#555] uppercase tracking-widest text-[9px]">LOCAL_DISK_FILE_PATHS</span>
                                      <div 
                                        className="flex flex-col gap-1 bg-[#0d0d0d] p-3 border break-all text-[#888] leading-normal font-mono text-[9px]"
                                        style={{ borderColor: "#1e1e1e" }}
                                      >
                                        <p className="mb-1"><span className="text-[#444] block">SYMBOL_FILE:</span> {item.symbolFile}</p>
                                        <p className="mb-1"><span className="text-[#444] block">FOOTPRINT_FILE:</span> {item.footprintFile}</p>
                                        <p><span className="text-[#444] block">MODEL_3D_FILE:</span> {item.modelFile || 'N/A'}</p>
                                      </div>
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TERMINAL PANEL */}
        {showLogs && (
          <div className="border flex flex-col mt-4 bg-[#0d0d0d] shrink-0" style={{ borderColor: "#2a2a2a", borderRadius: "4px" }}>
            <div 
              className="flex justify-between items-center px-3 py-2 border-b"
              style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
            >
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#888]">
                <Terminal size={12} style={{ color: GREEN }} />
                <span className="text-[#ddd8cc] tracking-widest font-mono">PARTKIT_CONSOLE_LOGS</span>
              </div>
              <button 
                onClick={clearLogs} 
                className="text-[9px] text-[#666] hover:text-[#aaa] px-2 py-0.5 border bg-black font-mono uppercase transition-colors cursor-pointer"
                style={{ borderColor: "#2a2a2a", borderRadius: "3px" }}
              >
                Clear Console
              </button>
            </div>
            
            <div 
              className="terminal-body font-mono text-[11px] p-3 overflow-y-auto"
              style={{ background: "#080808", height: "200px" }}
              ref={terminalBodyRef}
            >
              {logs.length === 0 ? (
                <div className="text-[#444] italic">[CONSOLE_IDLE_READY]</div>
              ) : (
                logs.map((log, idx) => {
                  let cls = 'terminal-log-info';
                  let color = '#888';
                  if (log.level === 'SUCCESS') { cls = 'terminal-log-success'; color = GREEN; }
                  if (log.level === 'WARN') { cls = 'terminal-log-warn'; color = '#ffcc00'; }
                  if (log.level === 'ERROR') { cls = 'terminal-log-error'; color = '#b84040'; }
                  return (
                    <div key={idx} className="flex gap-2">
                      <span className="text-[#444] select-none">[{log.timestamp}]</span>
                      <span className={cls} style={{ color }}>[{log.level}]</span>
                      <span className="text-[#ddd8cc]">{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}

      </main>

      {/* STATUS BAR */}
      <footer
        className="flex items-center justify-between px-4 border-t shrink-0 select-none"
        style={{ height: "32px", borderColor: "#1e1e1e", background: "#0a0a0a", zIndex: 100, position: 'fixed', bottom: 0, left: 0, right: 0 }}
      >
        {/* Left: Status Dot, Port, Parts Loaded count */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-mono" style={{ color: "#444" }}>
              STATUS:
            </span>
            <StatusDot color={importing ? '#f59e0b' : loading ? '#3b82f6' : parts.length > 0 ? GREEN : '#333'} />
            <span 
              className="text-[9px] uppercase tracking-wider font-mono" 
              style={{ color: importing ? '#f59e0b' : loading ? '#3b82f6' : parts.length > 0 ? GREEN : '#666' }}
            >
              {importing ? 'INSTALLING' : loading ? 'PARSING' : parts.length > 0 ? 'PACKAGE_LOADED' : 'STANDBY'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-mono" style={{ color: "#444" }}>
              PORT:
            </span>
            <StatusDot color="#333" />
            <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: "#666" }}>
              3010
            </span>
          </div>

          {parts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <StatusDot color="#333" />
              <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: "#666" }}>
                {activePartIndex + 1}/{parts.length} PARTS LOADED
              </span>
            </div>
          )}

          {activePart && activeReport && (
            <div 
              className="flex items-center gap-1.5 cursor-help" 
              title={activeReport.valid 
                ? "Sanity checks passed: all references verified successfully" 
                : `Sanity checks failed:\n${activeReport.errors.map(e => `- ${e}`).join('\n')}${activeReport.warnings.length > 0 ? `\n\nWarnings:\n${activeReport.warnings.map(w => `- ${w}`).join('\n')}` : ''}`
              }
            >
              <StatusDot color="#333" />
              {activeReport.valid ? (
                <>
                  <ShieldCheck size={12} style={{ color: GREEN }} />
                  <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: GREEN }}>
                    CHECKS OK
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={12} style={{ color: "#b84040" }} />
                  <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: "#b84040" }}>
                    CHECKS ERROR
                  </span>
                </>
              )}
            </div>
          )}

        </div>

        {/* Center/Right: Tab selectors & config/console toggle links */}
        <div className="flex items-center gap-0">
          {(["IMPORTER", "DATABASE"] as const).map((tab) => {
            const active = tab.toLowerCase() === activeTab;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab.toLowerCase() as "importer" | "database");
                  if (tab === 'DATABASE') fetchComponents(searchQuery);
                }}
                className="px-3 py-0.5 text-[9px] uppercase tracking-widest border-l border-t border-r transition-colors font-mono cursor-pointer"
                style={{
                  borderColor: active ? ORANGE : "#1e1e1e",
                  background: active ? "#1a0a00" : "transparent",
                  color: active ? ORANGE : "#444",
                  marginTop: active ? "-1.5px" : 0,
                  borderRadius: "3px 3px 0 0",
                  height: "22px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderBottom: active ? "1px solid #0a0a0a" : "1px solid #1e1e1e",
                }}
              >
                {tab}
              </button>
            );
          })}
          
          <div style={{ width: "1px", height: "16px", background: "#1e1e1e", marginLeft: "8px", marginRight: "4px" }} />
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-2.5 text-[9px] uppercase tracking-wider hover:text-[#aaa] transition-colors font-mono cursor-pointer bg-transparent border-none"
            style={{ color: showSettings ? ORANGE : "#444" }}
          >
            config
          </button>
          
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="px-2.5 text-[9px] uppercase tracking-wider hover:text-[#aaa] transition-colors font-mono cursor-pointer bg-transparent border-none"
            style={{ color: showLogs ? ORANGE : "#444" }}
          >
            console
          </button>
        </div>
      </footer>
    </div>
  );
}
