#!/bin/bash

# PartKit KiCad Action Plugin Installer for macOS

echo "==========================================="
echo "PartKit KiCad Action Plugin Installer"
echo "==========================================="

# Target KiCad preference version directory
KICAD_VERSION="10.0"
PLUGINS_DIR="$HOME/Library/Preferences/kicad/$KICAD_VERSION/scripting/plugins"
PROJECT_DIR="$(pwd)"

echo "Checking installation path..."
echo "KiCad Plugins Target: $PLUGINS_DIR"
echo "Project Path: $PROJECT_DIR"

# 1. Create directories if not existing
if [ ! -d "$PLUGINS_DIR" ]; then
    echo "Creating KiCad scripting plugins directory..."
    mkdir -p "$PLUGINS_DIR"
fi

# 2. Check if partkit_plugin.py exists in project
if [ ! -f "$PROJECT_DIR/partkit_plugin.py" ]; then
    echo "Error: partkit_plugin.py not found in the current working directory!"
    echo "Please run this script from the root of the PartKit project."
    exit 1
fi

# 3. Create symlink
TARGET_LINK="$PLUGINS_DIR/partkit_plugin.py"

if [ -L "$TARGET_LINK" ] || [ -f "$TARGET_LINK" ]; then
    echo "Removing pre-existing plugin link/file at target..."
    rm -f "$TARGET_LINK"
fi

echo "Creating symbolic link..."
ln -s "$PROJECT_DIR/partkit_plugin.py" "$TARGET_LINK"

if [ $? -eq 0 ]; then
    echo "-------------------------------------------"
    echo "SUCCESS: PartKit KiCad plugin installed successfully!"
    echo "Please restart KiCad and check the toolbar in the PCB Editor."
    echo "==========================================="
else
    echo "Error: Symlink creation failed."
    exit 1
fi
