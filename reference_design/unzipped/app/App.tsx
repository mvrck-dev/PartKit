import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, RotateCcw, ArrowRight, Cpu } from "lucide-react";

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
    <div className="flex items-center gap-2 mb-1">
      <span
        className="text-[10px] font-bold tabular-nums"
        style={{ color: ORANGE, fontFamily: "IBM Plex Mono, monospace" }}
      >
        {String(n).padStart(2, "0")}.
      </span>
      <span
        className="text-[10px] uppercase tracking-widest"
        style={{ color: "#666", fontFamily: "IBM Plex Mono, monospace" }}
      >
        {label}
      </span>
    </div>
  );
}

function TEInput({
  placeholder,
  value,
  readOnly,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}) {
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

function TESelect({ value, options }: { value: string; options: string[] }) {
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
        }}
        defaultValue={value}
        onFocus={(e) => (e.currentTarget.style.borderColor = ORANGE)}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ background: "#0d0d0d" }}>
            {o}
          </option>
        ))}
      </select>
      <ChevronRight
        size={10}
        className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none"
        style={{ color: "#444" }}
      />
    </div>
  );
}

function PreviewPanel({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 flex flex-col border overflow-hidden"
      style={{ borderColor: "#2a2a2a", borderRadius: "4px 0 4px 4px" }}
    >
      <div
        className="px-2.5 py-1.5 border-b"
        style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
      >
        <p
          className="text-[9px] uppercase tracking-wider leading-tight"
          style={{ color: "#555", fontFamily: "IBM Plex Mono, monospace" }}
        >
          {label}
        </p>
        {sublabel && (
          <p
            className="text-[9px] leading-tight mt-0.5"
            style={{ color: "#444", fontFamily: "IBM Plex Mono, monospace" }}
          >
            {sublabel}
          </p>
        )}
      </div>
      <div
        className="flex-1 flex items-center justify-center px-[0px] py-[179px]"
        style={{ background: "#080808", minHeight: "110px" }}
      >
        {children}
      </div>
    </div>
  );
}

function SymbolPreview() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect x="16" y="8" width="32" height="48" fill="none" stroke="#2a2a2a" strokeWidth="1" />
      {[12, 20, 28, 36, 44].map((y, i) => (
        <g key={i}>
          <line x1="4" y1={y} x2="16" y2={y} stroke="#ff5500" strokeWidth="0.8" opacity="0.7" />
          <rect x="2" y={y - 1.5} width="3" height="3" fill="#ff5500" opacity="0.5" rx="0.5" />
        </g>
      ))}
      {[12, 20, 28].map((y, i) => (
        <g key={i}>
          <line x1="48" y1={y} x2="60" y2={y} stroke="#ff5500" strokeWidth="0.8" opacity="0.7" />
          <rect x="59" y={y - 1.5} width="3" height="3" fill="#ff5500" opacity="0.5" rx="0.5" />
        </g>
      ))}
      <text x="32" y="36" textAnchor="middle" fontSize="8" fill="#444" fontFamily="IBM Plex Mono">
        ADI
      </text>
    </svg>
  );
}

function FootprintPreview() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect x="12" y="12" width="40" height="40" fill="none" stroke="#2a2a2a" strokeWidth="0.5" strokeDasharray="2,2" />
      {[18, 26, 34, 42].map((x, i) => (
        <rect key={i} x={x - 2} y="8" width="4" height="8" fill="#44ff88" opacity="0.4" rx="0.5" />
      ))}
      {[18, 26, 34, 42].map((x, i) => (
        <rect key={i} x={x - 2} y="48" width="4" height="8" fill="#44ff88" opacity="0.4" rx="0.5" />
      ))}
      <rect x="24" y="20" width="16" height="24" fill="#191919" stroke="#333" strokeWidth="0.8" />
      <circle cx="32" cy="32" r="2" fill="#ff5500" opacity="0.6" />
    </svg>
  );
}

function Model3DPreview() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <polygon points="32,8 56,20 56,44 32,56 8,44 8,20" fill="none" stroke="#2a2a2a" strokeWidth="0.8" />
      <polygon points="32,8 56,20 32,32" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      <polygon points="56,20 56,44 32,32" fill="#141414" stroke="#2a2a2a" strokeWidth="0.5" />
      <polygon points="32,56 8,44 32,32" fill="#0f0f0f" stroke="#222" strokeWidth="0.5" />
      <line x1="32" y1="8" x2="32" y2="32" stroke="#333" strokeWidth="0.5" strokeDasharray="1,2" />
      <line x1="56" y1="20" x2="32" y2="32" stroke="#333" strokeWidth="0.5" strokeDasharray="1,2" />
      <line x1="8" y1="44" x2="32" y2="32" stroke="#333" strokeWidth="0.5" strokeDasharray="1,2" />
      <text x="32" y="36" textAnchor="middle" fontSize="5" fill="#444" fontFamily="IBM Plex Mono">
        NO_MODEL
      </text>
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"importer" | "database">("importer");
  const [componentName, setComponentName] = useState("CB_11_1_ADI");
  const [mpn, setMpn] = useState("CB_11_1_ADI");
  const [physicalPkg, setPhysicalPkg] = useState("CB_11_1_ADI");

  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{ fontFamily: "IBM Plex Mono, monospace", background: "#111111" }}
    >
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-4 border-b"
        style={{
          height: "40px",
          borderColor: "#2a2a2a",
          background: "#0d0d0d",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            
            <span
              className="text-[13px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "#ddd8cc" }}
            >
              PARTKIT
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-[10px] tabular-nums"
            style={{ color: "#555" }}
          >
            1/1
          </span>
          {[ChevronLeft, ChevronRight].map((Icon, i) => (
            <button
              key={i}
              className="w-6 h-6 border flex items-center justify-center transition-colors hover:border-[#ff5500] hover:text-[#ff5500] group"
              style={{
                borderColor: "#2a2a2a",
                color: "#555",
                borderRadius: i === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
                marginLeft: i === 0 ? 0 : -1,
              }}
            >
              <Icon size={10} />
            </button>
          ))}
          <div style={{ width: "1px", height: "20px", background: "#2a2a2a", margin: "0 4px" }} />
          <button
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all hover:brightness-110"
            style={{
              background: ORANGE,
              color: "#111",
              borderRadius: "2px 6px 2px 6px",
            }}
          >
            <Plus size={9} strokeWidth={3} />
            add part
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col p-4 gap-3">

        {/* Preview panels */}
        <div className="grid grid-cols-3 gap-2">
          <PreviewPanel
            label="[SYMBOL]"
            sublabel="KiCADv6/2026-06-21_13-31-12.kicad_sym"
          >
            <SymbolPreview />
          </PreviewPanel>
          <PreviewPanel
            label="[FOOTPRINT]"
            sublabel="KiCADv6/footprints.pretty/CB_11_1_ADI.kicad_mod"
          >
            <FootprintPreview />
          </PreviewPanel>
          <PreviewPanel
            label="[3D MODEL]"
            sublabel="NO_MODEL"
          >
            <Model3DPreview />
          </PreviewPanel>
        </div>

        {/* Import status */}
        

        {/* Form section */}
        <div
          className="border flex flex-col"
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
              className="text-[10px] font-bold tracking-[0.15em] uppercase"
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
              <TEInput value={componentName} onChange={setComponentName} />
            </div>
            <div>
              <FieldLabel n={2} label="Sourced Website *" />
              <TESelect
                value="-- SELECT SOURCE WEBSITE --"
                options={["-- SELECT SOURCE WEBSITE --", "Mouser", "DigiKey", "LCSC", "Arrow"]}
              />
            </div>

            {/* Row 2 */}
            <div>
              <FieldLabel n={3} label="Manufacturer" />
              <TEInput placeholder="e.g. STMicroelectronics" />
            </div>
            <div>
              <FieldLabel n={4} label="Manufacturer Part Number (MPN)" />
              <TEInput value={mpn} onChange={setMpn} />
            </div>

            {/* Row 3 */}
            <div>
              <FieldLabel n={5} label="Physical Package" />
              <TEInput value={physicalPkg} onChange={setPhysicalPkg} />
            </div>
            <div>
              <FieldLabel n={6} label="Datasheet URL" />
              <TEInput placeholder="e.g. https://www.st.com/...pdf" />
            </div>

            {/* Row 4 */}
            <div>
              <FieldLabel n={7} label="Target Symbol Library" />
              <TESelect
                value="PartKit (Local)"
                options={["PartKit (Local)", "Custom Library"]}
              />
            </div>
            <div>
              <FieldLabel n={8} label="Target Footprint Library" />
              <TESelect
                value="PartKit.pretty (Local)"
                options={["PartKit.pretty (Local)", "Custom"]}
              />
            </div>

            {/* Row 5 - full width */}
            <div className="col-span-2">
              <FieldLabel n={9} label="Component Alias" />
              <TEInput placeholder="e.g. STM32F103" />
            </div>
          </div>

          {/* Action buttons */}
          <div
            className="flex items-center justify-end gap-2 px-4 py-3 border-t"
            style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
          >
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border transition-colors hover:border-[#555]"
              style={{ borderColor: "#2a2a2a", color: "#666", borderRadius: "3px" }}
            >
              <RotateCcw size={9} />
              clear_cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] uppercase tracking-widest font-bold transition-all hover:brightness-110"
              style={{
                background: ORANGE,
                color: "#111",
                borderRadius: "2px 6px 2px 6px",
              }}
            >
              LOAD PART
              <ArrowRight size={10} strokeWidth={3} />
            </button>
          </div>
        </div>
      </main>

      {/* Status bar */}
      <footer
        className="flex items-center justify-between px-4 border-t"
        style={{ height: "32px", borderColor: "#1e1e1e", background: "#0a0a0a" }}
      >
        <div className="flex items-center gap-4">
          {[
            { label: "STATUS:", value: "PACKAGE_LOADED", color: GREEN },
            { label: "PORT:", value: "3010", color: "#555" },
            { label: "", value: "1/1 PARTS LOADED", color: "#555" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {item.label && (
                <span className="text-[9px] uppercase" style={{ color: "#444" }}>
                  {item.label}
                </span>
              )}
              <StatusDot color={i === 0 ? GREEN : "#333"} />
              <span className="text-[9px] uppercase tracking-wider" style={{ color: item.color }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-0">
          {(["IMPORTER", "DATABASE"] as const).map((tab) => {
            const active = tab.toLowerCase() === activeTab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase() as "importer" | "database")}
                className="px-3 py-0.5 text-[9px] uppercase tracking-widest border-l border-t border-r transition-colors"
                style={{
                  borderColor: active ? ORANGE : "#1e1e1e",
                  background: active ? "#1a0a00" : "transparent",
                  color: active ? ORANGE : "#444",
                  marginTop: active ? "-1px" : 0,
                  borderRadius: "3px 3px 0 0",
                  borderBottom: active ? "1px solid #0a0a0a" : "1px solid #1e1e1e",
                }}
              >
                {tab}
              </button>
            );
          })}
          <div style={{ width: "1px", height: "16px", background: "#1e1e1e", marginLeft: "8px" }} />
          {["config", "console"].map((item) => (
            <button
              key={item}
              className="px-2.5 text-[9px] uppercase tracking-wider hover:text-[#aaa] transition-colors"
              style={{ color: "#444" }}
            >
              {item}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
