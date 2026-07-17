# PartKit

PartKit is a native, zero-dependency external action plugin for **KiCad** designed to streamline component importing. Written in 100% pure Python and utilizing KiCad's bundled wxPython framework, it eliminates complex dependencies like React, Node, WebViews, or local HTTP servers.

## Key Features

*   **Sleek Single-Column GUI**: A refined desktop interface inspired by Teenage Engineering aesthetics.
*   **Unified Drag & Drop**: Drag a ZIP package (e.g. from Ultra Librarian, SnapEDA) or individual `.kicad_sym`, `.kicad_mod`, or `.step`/`.wrl` files anywhere on the dialog to auto-parse metadata and extract assets.
*   **Interactive Footprint Viewer**: Renders PCB copper pads dynamically with support for mouse click-and-drag panning and mouse wheel zooming.
*   **Bidirectional Cross-Probing**: Hovering over a schematic pin in the symbol preview highlights the corresponding footprint pad in green, and vice versa, ensuring proper pad mapping before import.
*   **Dynamic Library Discovery**: Auto-detects and lists all your active symbol and footprint target libraries directly from your local KiCad global configuration tables (`sym-lib-table` and `fp-lib-table`).
*   **Atomic Transactions**: Copies files, renames models, updates S-expression links, and registers libraries in database indexes atomically. If any step fails, changes are automatically rolled back.

## Repository Structure

*   `__init__.py`: KiCad plugin registration entrypoint.
*   `partkit_action.py`: Dialog interface logic, layout controls, interactive graphics panels (`wx.PaintDC`), and mouse events.
*   `sexpr.py`: Custom zero-dependency KiCad S-expression parser/serializer, validation checkers, and library registrars.
*   `icon.png`: Toolbar action icon displayed in KiCad.

## Installation

### macOS
Symlink or copy the `PartKit` folder into your KiCad scripting plugins directory:
```bash
ln -s "/path/to/PartKit" ~/Library/Preferences/kicad/10.0/scripting/plugins/PartKit
```

### Windows
Copy the `PartKit` folder into your KiCad user plugins directory:
`%APPDATA%\kicad\10.0\scripting\plugins\`

### Linux
Copy the `PartKit` folder into:
`~/.config/kicad/10.0/scripting/plugins/`

---

## Running Standalone

You can test and run the PartKit GUI outside KiCad using KiCad's bundled Python interpreter (which includes the required `wxPython` environment):

**macOS:**
```bash
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 partkit_action.py
```
