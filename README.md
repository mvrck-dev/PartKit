# PartKit

An external action plugin for KiCad to import component packages (ZIPs, symbols, footprints, and 3D models) into your KiCad libraries.

## How it works

1. **Drop files**: Drag and drop a ZIP archive (containing footprint, symbol, and 3D files) or individual `.kicad_sym`, `.kicad_mod`, or `.step`/`.wrl` files anywhere on the window.
2. **Visual check**: Previews the schematic symbol and PCB footprint side-by-side. Hovering over a symbol pin highlights the matching pad on the footprint (and vice versa) to confirm mapping.
3. **Import**: Copies and links the 3D model to the footprint, appends the symbol and footprint to your target libraries, and registers them in your `sym-lib-table` / `fp-lib-table` configurations.

## Repository files

* `__init__.py`: KiCad plugin registration hook.
* `partkit_action.py`: GUI window panel, custom canvas drawing (`wx.PaintDC`), mouse hover/pan/zoom events.
* `sexpr.py`: Custom KiCad S-expression parser/serializer and table registry logic.
* `icon.png`: KiCad toolbar icon.

## Installation

### macOS
Symlink the `PartKit` directory to your KiCad plugins path:
```bash
ln -s "/path/to/PartKit" ~/Library/Preferences/kicad/10.0/scripting/plugins/PartKit
```

### Windows
Copy the `PartKit` directory into:
`%APPDATA%\kicad\10.0\scripting\plugins\`

### Linux
Copy the `PartKit` directory into:
`~/.config/kicad/10.0/scripting/plugins/`

---

## Standalone Execution

You can run and test the GUI outside KiCad using KiCad's bundled Python interpreter (which has the required `wx` module):

**macOS:**
```bash
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 partkit_action.py
```
