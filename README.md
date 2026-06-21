# PartKit — KiCad Component Importer & Syncer

PartKit is a local developer tool designed to eliminate the friction of importing component libraries (schematic symbols, PCB footprints, and 3D step models) downloaded from component databases like **Ultra Librarian**, **SnapEDA**, **SamacSys**, and **Octopart** directly into KiCad 6.0/7.0/8.0/10.0.

It parses standard KiCad S-expression files (.kicad_sym, .kicad_mod) and CAD models, enabling interactive visual checking, name cleanup, and 3D alignment before writing files into your active KiCad library tables.

![PartKit Dashboard](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80) *(Stylized visual preview representation)*

## Features

1. **Interactive Pin-to-Pad Cross-Probing (Sync Check)**: Hovering over schematic pins highlights the corresponding copper pad in the footprint preview with a neon glow, ensuring symbol-to-footprint mapping matches correctly.
2. **Interactive 3D Offset Alignment Sliders**: Adjust X, Y, and Z offsets, rotations, and scales in real-time on a 3D rotating canvas. The adjusted alignment matrices are written directly back to the imported `.kicad_mod` file.
3. **No-Friction Renaming**: Automatically renames symbols, footprints, 3D files, and updates all nested references and paths inside S-expressions.
4. **Direct Library Integration**: Automatically reads `sym-lib-table` and `fp-lib-table` configurations from KiCad preferences, letting you select target libraries from dropdowns and copying assets instantly.
5. **Integrated Terminal Console**: Collapsible live terminal stream displaying parsing operations, path mappings, file copies, and warning diagnostics.
6. **KiCad Toolbar Action Button**: Launch PartKit and start the backend directly from inside KiCad's PCB editor window.

---

## Getting Started

### 1. Prerequisites
Ensure you have **Node.js (v14+)** and **npm** installed on your system.

### 2. Build the Application
Compile the React/TypeScript frontend into static assets:
```bash
npm run build
```

### 3. Run the Development Server
To launch both the Node.js Express API and the Vite hot-reloading client in parallel:
```bash
npm run dev
```
The React frontend runs on `http://localhost:5173` (proxying requests to the backend API).

### 4. Run the Standalone App
To run the server in standalone mode (useful for production and plugin launch):
```bash
npm start
```
The server will run on `http://localhost:3010` and host both the API and the compiled React app.

---

## Installing the KiCad Integration

PartKit includes a KiCad **Action Plugin** that adds a button in your PCB Editor toolbar to run the server and open the app in your browser with a single click.

### macOS Installation
1. Locate your KiCad script plugin directory (typically `~/Library/Preferences/kicad/10.0/scripting/plugins` or `~/Library/Application Support/kicad/10.0/plugins`).
2. Create a symbolic link from your KiCad plugin directory to the `partkit_plugin.py` file and the root `PartKit` directory:
   ```bash
   ln -s "/Users/mvrck/Developer/Projects/PartKit/partkit_plugin.py" "$HOME/Library/Preferences/kicad/10.0/scripting/plugins/partkit_plugin.py"
   ```
3. Restart KiCad. In the PCB Editor, you will see a new **PartKit Importer** button in your toolbar or under **Tools > External Plugins**.

---

## File Structure

```
├── package.json         # Build and scripts configurations
├── server.js            # Node/Express API backend server
├── parser.js            # S-expression parser & serializer
├── partkit_plugin.py    # KiCad action plugin connector (Python)
├── index.html           # Entry HTML index file
├── src
│   ├── App.tsx          # Dashboard layout & event handlers
│   ├── index.css        # Obsidian Neon glassmorphism styling
│   ├── main.tsx         # React compiler entrypoint
│   └── components
│       └── ThreeDPreview.tsx  # Three.js 3D alignment engine
```
