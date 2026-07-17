# partkit_action.py
import os
import sys
import shutil
import zipfile
import re
import hashlib
import json
from datetime import datetime
import wx
import pcbnew

# Import S-Expression helpers
try:
    from .sexpr import (
        parse_sexpr,
        serialize_sexpr,
        parse_symbol_tree,
        parse_footprint_tree,
        validate_component
    )
except ImportError:
    from sexpr import (
        parse_sexpr,
        serialize_sexpr,
        parse_symbol_tree,
        parse_footprint_tree,
        validate_component
    )

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(PLUGIN_DIR, 'extracted')
LIBRARIES_DIR = os.path.join(PLUGIN_DIR, 'libraries')
DB_PATH = os.path.join(LIBRARIES_DIR, 'database.json')
CONFIG_PATH = os.path.join(PLUGIN_DIR, 'config.json')

# Create directories
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(LIBRARIES_DIR, exist_ok=True)

# Default KiCad preferences directory locator
def get_kicad_prefs_dir():
    home = os.path.expanduser('~')
    if sys.platform == 'darwin':
        return os.path.join(home, 'Library', 'Preferences', 'kicad', '10.0')
    elif sys.platform == 'win32':
        return os.path.join(os.environ.get('APPDATA', ''), 'kicad', '10.0')
    else:
        return os.path.join(home, '.config', 'kicad', '10.0')

DEFAULT_CONFIG = {
    'kicadPrefsDir': get_kicad_prefs_dir(),
    'customSymbolLib': os.path.join(LIBRARIES_DIR, 'PartKit.kicad_sym'),
    'customFootprintLib': os.path.join(LIBRARIES_DIR, 'PartKit.pretty'),
    'custom3DDir': os.path.join(LIBRARIES_DIR, 'PartKit.3dshapes'),
}

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return DEFAULT_CONFIG.copy()

def load_database():
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return []

def save_database_data(db):
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2)

def get_file_checksum(filepath):
    if not os.path.exists(filepath):
        return ""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def register_library_in_table(lib_type: str, lib_name: str, lib_path: str, prefs_dir: str):
    table_file = 'sym-lib-table' if lib_type == 'sym' else 'fp-lib-table'
    table_path = os.path.join(prefs_dir, table_file)
    if not os.path.exists(table_path):
        return False
    try:
        with open(table_path, 'r', encoding='utf-8') as f:
            content = f.read()
        tree = parse_sexpr(content)
        root_token = 'sym_lib_table' if lib_type == 'sym' else 'fp_lib_table'
        if isinstance(tree, list) and len(tree) > 0 and tree[0] == root_token:
            is_registered = False
            for item in tree[1:]:
                if isinstance(item, list) and item[0] == 'lib':
                    name_node = next((x for x in item[1:] if isinstance(x, list) and x[0] == 'name'), None)
                    if name_node and len(name_node) >= 2 and name_node[1] == lib_name:
                        is_registered = True
                        break
            if is_registered:
                return True
            
            lib_node = [
                'lib',
                ['name', lib_name],
                ['type', 'KiCad'],
                ['uri', lib_path],
                ['options', ''],
                ['descr', 'Added by PartKit plugin']
            ]
            tree.append(lib_node)
            serialized = serialize_sexpr(tree)
            with open(table_path, 'w', encoding='utf-8') as f:
                f.write(serialized)
            return True
    except Exception as e:
        print("Error registering library in table {}: {}".format(table_file, e))
    return False

# File Drop Handler
class PartKitFileDropTarget(wx.FileDropTarget):
    def __init__(self, dialog):
        super(PartKitFileDropTarget, self).__init__()
        self.dialog = dialog

    def OnDropFiles(self, x, y, filenames):
        if not filenames:
            return False
        self.dialog.handle_dropped_file(filenames[0])
        return True

# Symbol Preview Panel with hover cross-probing
class SymbolPreviewPanel(wx.Panel):
    def __init__(self, parent, dialog):
        super(SymbolPreviewPanel, self).__init__(parent, size=wx.Size(260, 260))
        self.dialog = dialog
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.Bind(wx.EVT_PAINT, self.OnPaint)
        self.Bind(wx.EVT_MOTION, self.OnMouseMove)
        self.symbol_data = None
        self.part_name = ""
        
        self.hovered_pin_num = None
        self.pin_regions = [] # list of dicts: {'num': str, 'rect': wx.Rect}

    def set_data(self, data, name):
        self.symbol_data = data
        self.part_name = name
        self.hovered_pin_num = None
        self.Refresh()

    def set_external_hover(self, pin_num):
        if self.hovered_pin_num != pin_num:
            self.hovered_pin_num = pin_num
            self.Refresh()

    def OnMouseMove(self, event):
        if not self.symbol_data:
            return
        pos = event.GetPosition()
        hovered = None
        for reg in self.pin_regions:
            if reg['rect'].Contains(pos):
                hovered = reg['num']
                break
        
        if self.hovered_pin_num != hovered:
            self.hovered_pin_num = hovered
            self.Refresh()
            self.dialog.on_symbol_hover(hovered)

    def OnPaint(self, event):
        dc = wx.PaintDC(self)
        width, height = self.GetClientSize()
        
        # Graphite dark theme
        dc.SetBackground(wx.Brush(wx.Colour(18, 18, 18)))
        dc.Clear()

        # Rounded border box
        dc.SetPen(wx.Pen(wx.Colour(45, 45, 48), 1))
        dc.SetBrush(wx.TRANSPARENT_BRUSH)
        dc.DrawRoundedRectangle(2, 2, width - 4, height - 4, 4)

        dc.SetFont(wx.Font(9, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))

        # Title
        dc.SetTextForeground(wx.Colour(100, 100, 100))
        dc.DrawText("SYMBOL", 10, 10)

        if not self.symbol_data or not self.symbol_data.get('symbols'):
            dc.SetFont(wx.Font(10, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
            text = "No Symbol Loaded"
            tw, th = dc.GetTextExtent(text)
            dc.SetTextForeground(wx.Colour(80, 80, 80))
            dc.DrawText(text, (width - tw) // 2, (height - th) // 2)
            return

        sym = self.symbol_data['symbols'][0]
        pins = sym.get('pins', [])

        box_width = 110
        pin_spacing = 18
        box_height = max(len(pins) * pin_spacing / 2 + 30, 80)
        box_height = min(box_height, height - 80)

        cx, cy = width // 2, height // 2 + 10

        # Component Body Outline
        dc.SetPen(wx.Pen(wx.Colour(255, 85, 0), 1.5))
        dc.SetBrush(wx.Brush(wx.Colour(30, 30, 30)))
        dc.DrawRectangle(cx - box_width // 2, cy - box_height // 2, box_width, box_height)

        # Ref Designator
        ref_text = sym.get('properties', {}).get('Reference', 'U')
        dc.SetFont(wx.Font(8, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
        tw, th = dc.GetTextExtent(ref_text)
        dc.SetTextForeground(wx.Colour(140, 140, 140))
        dc.DrawText(ref_text, cx - tw // 2, cy - box_height // 2 + 6)

        # Value / Name
        val_text = self.part_name or sym.get('name', 'VAL')
        tw, th = dc.GetTextExtent(val_text)
        dc.SetTextForeground(wx.Colour(220, 220, 220))
        dc.DrawText(val_text, cx - tw // 2, cy + box_height // 2 - th - 6)

        left_pins = [p for i, p in enumerate(pins) if i % 2 == 0]
        right_pins = [p for i, p in enumerate(pins) if i % 2 != 0]

        self.pin_regions = []

        # Draw Left Pins
        for i, pin in enumerate(left_pins):
            py = cy - box_height // 2 + 25 + i * pin_spacing
            if py > cy + box_height // 2 - 15:
                break
            
            is_hovered = (self.hovered_pin_num == pin['number'])
            color = wx.Colour(68, 255, 136) if is_hovered else wx.Colour(255, 85, 0)
            
            # Pin Line
            dc.SetPen(wx.Pen(color, 1.5 if is_hovered else 1))
            dc.DrawLine(cx - box_width // 2 - 12, py, cx - box_width // 2, py)
            dc.DrawCircle(cx - box_width // 2 - 12, py, 1.5)

            # Pin Number
            dc.SetFont(wx.Font(7, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
            dc.SetTextForeground(wx.Colour(100, 100, 100) if not is_hovered else color)
            dc.DrawText(pin['number'], cx - box_width // 2 - 20, py - 9)

            # Pin Name
            dc.SetFont(wx.Font(8, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))
            dc.SetTextForeground(wx.Colour(220, 220, 220) if not is_hovered else color)
            dc.DrawText(pin['name'], cx - box_width // 2 + 5, py - 6)

            # Save hover region
            self.pin_regions.append({
                'num': pin['number'],
                'rect': wx.Rect(cx - box_width // 2 - 25, py - 8, box_width // 2 + 25, 16)
            })

        # Draw Right Pins
        for i, pin in enumerate(right_pins):
            py = cy - box_height // 2 + 25 + i * pin_spacing
            if py > cy + box_height // 2 - 15:
                break

            is_hovered = (self.hovered_pin_num == pin['number'])
            color = wx.Colour(68, 255, 136) if is_hovered else wx.Colour(255, 85, 0)

            # Pin Line
            dc.SetPen(wx.Pen(color, 1.5 if is_hovered else 1))
            dc.DrawLine(cx + box_width // 2, py, cx + box_width // 2 + 12, py)
            dc.DrawCircle(cx + box_width // 2 + 12, py, 1.5)

            # Pin Number
            dc.SetFont(wx.Font(7, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
            dc.SetTextForeground(wx.Colour(100, 100, 100) if not is_hovered else color)
            dc.DrawText(pin['number'], cx + box_width // 2 + 14, py - 9)

            # Pin Name
            dc.SetFont(wx.Font(8, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))
            dc.SetTextForeground(wx.Colour(220, 220, 220) if not is_hovered else color)
            tw, th = dc.GetTextExtent(pin['name'])
            dc.DrawText(pin['name'], cx + box_width // 2 - tw - 5, py - 6)

            # Save hover region
            self.pin_regions.append({
                'num': pin['number'],
                'rect': wx.Rect(cx, py - 8, box_width // 2 + 25, 16)
            })

# Footprint Canvas with zoom, pan, and hover highlighting
class FootprintPreviewPanel(wx.Panel):
    def __init__(self, parent, dialog):
        super(FootprintPreviewPanel, self).__init__(parent, size=wx.Size(260, 260))
        self.dialog = dialog
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        
        self.scale = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0
        self.is_dragging = False
        self.drag_start = wx.Point(0, 0)
        self.hovered_pad_num = None
        self.footprint_data = None
        self.pad_regions = [] # list of dicts: {'num': str, 'center': (x,y), 'w': w, 'h': h, 'shape': str}

        # Bindings
        self.Bind(wx.EVT_PAINT, self.OnPaint)
        self.Bind(wx.EVT_LEFT_DOWN, self.OnMouseDown)
        self.Bind(wx.EVT_MOTION, self.OnMouseMove)
        self.Bind(wx.EVT_LEFT_UP, self.OnMouseUp)
        self.Bind(wx.EVT_LEAVE_WINDOW, self.OnMouseUp)
        self.Bind(wx.EVT_MOUSEWHEEL, self.OnMouseWheel)

    def set_data(self, data):
        self.footprint_data = data
        self.scale = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0
        self.hovered_pad_num = None
        self.Refresh()

    def set_external_hover(self, pad_num):
        if self.hovered_pad_num != pad_num:
            self.hovered_pad_num = pad_num
            self.Refresh()

    def OnMouseDown(self, event):
        self.is_dragging = True
        self.drag_start = event.GetPosition()
        self.CaptureMouse()

    def OnMouseMove(self, event):
        if self.is_dragging and event.Dragging() and event.LeftIsDown():
            pos = event.GetPosition()
            dx = pos.x - self.drag_start.x
            dy = pos.y - self.drag_start.y
            self.offset_x += dx
            self.offset_y += dy
            self.drag_start = pos
            self.Refresh()
        elif not self.is_dragging and self.footprint_data:
            pos = event.GetPosition()
            hovered = None
            for reg in self.pad_regions:
                # Basic hit bounding box check
                px, py = reg['pixel_pos']
                pw, ph = reg['pixel_size']
                if px - pw // 2 <= pos.x <= px + pw // 2 and py - ph // 2 <= pos.y <= py + ph // 2:
                    hovered = reg['num']
                    break
            
            if self.hovered_pad_num != hovered:
                self.hovered_pad_num = hovered
                self.Refresh()
                self.dialog.on_footprint_hover(hovered)

    def OnMouseUp(self, event):
        if self.is_dragging:
            self.is_dragging = False
            self.ReleaseMouse()

    def OnMouseWheel(self, event):
        rotation = event.GetWheelRotation()
        if rotation > 0:
            self.scale = min(self.scale * 1.1, 30.0)
        else:
            self.scale = max(self.scale / 1.1, 0.1)
        self.Refresh()

    def OnPaint(self, event):
        dc = wx.PaintDC(self)
        width, height = self.GetClientSize()
        
        # Graphite dark theme
        dc.SetBackground(wx.Brush(wx.Colour(18, 18, 18)))
        dc.Clear()

        # Rounded border box
        dc.SetPen(wx.Pen(wx.Colour(45, 45, 48), 1))
        dc.SetBrush(wx.TRANSPARENT_BRUSH)
        dc.DrawRoundedRectangle(2, 2, width - 4, height - 4, 4)

        dc.SetFont(wx.Font(9, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))

        # Title
        dc.SetTextForeground(wx.Colour(100, 100, 100))
        dc.DrawText("FOOTPRINT", 10, 10)

        if not self.footprint_data or not self.footprint_data.get('pads'):
            dc.SetFont(wx.Font(10, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
            text = "No Footprint Loaded"
            tw, th = dc.GetTextExtent(text)
            dc.SetTextForeground(wx.Colour(80, 80, 80))
            dc.DrawText(text, (width - tw) // 2, (height - th) // 2)
            return

        pads = self.footprint_data['pads']

        min_x, max_x = float('inf'), float('-inf')
        min_y, max_y = float('inf'), float('-inf')
        for pad in pads:
            x, y = pad.get('x', 0.0), pad.get('y', 0.0)
            pw, ph = pad.get('w', 1.0), pad.get('h', 1.0)
            min_x = min(min_x, x - pw / 2.0)
            max_x = max(max_x, x + pw / 2.0)
            min_y = min(min_y, y - ph / 2.0)
            max_y = max(max_y, y + ph / 2.0)

        span_x = max_x - min_x
        span_y = max_y - min_y
        max_span = max(span_x, span_y, 1.0)

        base_scale = 180.0 / max_span
        draw_scale = base_scale * self.scale

        cx, cy = width // 2 + self.offset_x, height // 2 + self.offset_y

        # Grid reference lines
        dc.SetPen(wx.Pen(wx.Colour(28, 28, 28), 1, wx.PENSTYLE_DOT))
        dc.DrawCircle(cx, cy, int(5.0 * draw_scale))
        dc.DrawCircle(cx, cy, int(10.0 * draw_scale))
        dc.DrawLine(cx - 10, cy, cx + 10, cy)
        dc.DrawLine(cx, cy - 10, cx, cy + 10)

        self.pad_regions = []

        dc.SetFont(wx.Font(7, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))

        for pad in pads:
            px = cx + int(pad.get('x', 0.0) * draw_scale)
            # KiCad Y is downward
            py = cy + int(pad.get('y', 0.0) * draw_scale)

            pw = int(pad.get('w', 1.0) * draw_scale)
            ph = int(pad.get('h', 1.0) * draw_scale)


            is_hovered = (self.hovered_pad_num == pad['number'])

            # Highlighter: bright green on hover, copper/brown default
            brush_color = wx.Colour(20, 80, 40) if is_hovered else wx.Colour(58, 26, 8)
            pen_color = wx.Colour(68, 255, 136) if is_hovered else wx.Colour(255, 85, 0)

            dc.SetPen(wx.Pen(pen_color, 1.5 if is_hovered else 1))
            dc.SetBrush(wx.Brush(brush_color))

            if pad.get('shape') == 'circle':
                dc.DrawCircle(px, py, pw // 2)
            else:
                dc.DrawRectangle(px - pw // 2, py - ph // 2, pw, ph)

            # Pad Number inside
            num_str = str(pad.get('number', ''))
            tw, th = dc.GetTextExtent(num_str)
            dc.SetTextForeground(wx.Colour(255, 255, 255) if not is_hovered else wx.Colour(68, 255, 136))
            dc.DrawText(num_str, px - tw // 2, py - th // 2)

            self.pad_regions.append({
                'num': pad['number'],
                'pixel_pos': (px, py),
                'pixel_size': (pw, ph)
            })

# 3D Path Preview Panel
class ThreeDPreviewPanel(wx.Panel):
    def __init__(self, parent):
        super(ThreeDPreviewPanel, self).__init__(parent, size=wx.Size(260, 260))
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.Bind(wx.EVT_PAINT, self.OnPaint)
        self.model_file = None

    def set_model(self, file_name):
        self.model_file = file_name
        self.Refresh()

    def OnPaint(self, event):
        dc = wx.PaintDC(self)
        width, height = self.GetClientSize()

        # Graphite dark theme
        dc.SetBackground(wx.Brush(wx.Colour(18, 18, 18)))
        dc.Clear()

        # Rounded border box
        dc.SetPen(wx.Pen(wx.Colour(45, 45, 48), 1))
        dc.SetBrush(wx.TRANSPARENT_BRUSH)
        dc.DrawRoundedRectangle(2, 2, width - 4, height - 4, 4)

        dc.SetFont(wx.Font(9, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD))

        # Title
        dc.SetTextForeground(wx.Colour(100, 100, 100))
        dc.DrawText("3D", 10, 10)

        dc.SetFont(wx.Font(10, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL))
        if self.model_file:
            # Display model name and file info
            dc.SetPen(wx.Pen(wx.Colour(255, 85, 0), 1))
            dc.SetBrush(wx.Brush(wx.Colour(28, 28, 28)))
            dc.DrawRoundedRectangle(15, 60, width - 30, height - 100, 4)

            lines = [
                "[3D MODEL LOADED]",
                "FILE:",
                self.model_file,
                "",
                "STATUS: STANDBY",
                "IMPORTING WITH PART"
            ]
            dc.SetTextForeground(wx.Colour(220, 220, 220))
            for idx, line in enumerate(lines):
                if idx == 0:
                    dc.SetTextForeground(wx.Colour(68, 255, 136)) # Green
                else:
                    dc.SetTextForeground(wx.Colour(180, 180, 180))
                
                # Truncate long lines to fit panel width
                tw, th = dc.GetTextExtent(line)
                if tw > width - 40:
                    line = line[:20] + "..."
                    tw, th = dc.GetTextExtent(line)
                
                dc.DrawText(line, (width - tw) // 2, 80 + idx * 18)
        else:
            text = "No 3D Model Loaded"
            tw, th = dc.GetTextExtent(text)
            dc.SetTextForeground(wx.Colour(80, 80, 80))
            dc.DrawText(text, (width - tw) // 2, (height - th) // 2)

class PartKitDialog(wx.Dialog):
    def __init__(self, parent):
        super(PartKitDialog, self).__init__(
            parent, 
            id=wx.ID_ANY, 
            title="PartKit Importer", 
            size=wx.Size(840, 720), 
            style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER | wx.MAXIMIZE_BOX
        )

        self.active_temp_dir = ""
        self.symbol_file = None
        self.footprint_file = None
        self.model_file = None
        self.symbol_data = None
        self.footprint_data = None

        self.config = load_config()

        # UI Setup
        self.init_ui()

        # Drag and drop mapping
        self.SetDropTarget(PartKitFileDropTarget(self))

        self.load_target_libraries()

    def init_ui(self):
        # Premium dark theme graphite colors
        self.SetBackgroundColour(wx.Colour(30, 30, 30))
        self.SetForegroundColour(wx.Colour(220, 220, 220))

        # Main Vertical Sizer (Single Column Layout)
        main_sizer = wx.BoxSizer(wx.VERTICAL)

        # Clean, modern font configuration
        clean_font = wx.Font(10, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL)
        bold_font = wx.Font(10, wx.FONTFAMILY_DEFAULT, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_BOLD)

        # =====================================================================
        # ROW 1: Browse / File Selector Bar
        # =====================================================================
        browse_sizer = wx.BoxSizer(wx.HORIZONTAL)
        
        lbl_file = wx.StaticText(self, label="Package File:")
        lbl_file.SetFont(bold_font)
        lbl_file.SetForegroundColour(wx.Colour(160, 160, 160))
        browse_sizer.Add(lbl_file, 0, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, 8)

        self.txt_file_path = wx.TextCtrl(self, style=wx.TE_READONLY)
        self.txt_file_path.SetBackgroundColour(wx.Colour(22, 22, 22))
        self.txt_file_path.SetForegroundColour(wx.Colour(160, 160, 160))
        self.txt_file_path.SetFont(clean_font)
        self.txt_file_path.SetHint("Drag or browse files to import part (.zip, .kicad_sym, .kicad_mod)")
        browse_sizer.Add(self.txt_file_path, 1, wx.EXPAND | wx.RIGHT, 8)

        btn_browse = wx.Button(self, label="Browse")
        btn_browse.SetFont(bold_font)
        btn_browse.Bind(wx.EVT_BUTTON, self.on_browse)
        browse_sizer.Add(btn_browse, 0, wx.ALIGN_CENTER_VERTICAL)

        main_sizer.Add(browse_sizer, 0, wx.EXPAND | wx.ALL, 15)

        # =====================================================================
        # ROW 2: Three Side-by-Side Preview Squares
        # =====================================================================
        preview_sizer = wx.BoxSizer(wx.HORIZONTAL)
        
        self.canvas_sym = SymbolPreviewPanel(self, self)
        self.canvas_fp = FootprintPreviewPanel(self, self)
        self.canvas_3d = ThreeDPreviewPanel(self)

        preview_sizer.Add(self.canvas_sym, 1, wx.EXPAND | wx.RIGHT, 10)
        preview_sizer.Add(self.canvas_fp, 1, wx.EXPAND | wx.RIGHT, 10)
        preview_sizer.Add(self.canvas_3d, 1, wx.EXPAND)

        main_sizer.Add(preview_sizer, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 15)

        # =====================================================================
        # ROW 3: Form Fields Layout Grid
        # =====================================================================
        form_sizer = wx.FlexGridSizer(rows=5, cols=4, vgap=10, hgap=15)
        form_sizer.AddGrowableCol(1, 1)
        form_sizer.AddGrowableCol(3, 1)

        def add_field(label_text, is_choice=False, choice_list=[]):
            lbl = wx.StaticText(self, label=label_text)
            lbl.SetFont(bold_font)
            lbl.SetForegroundColour(wx.Colour(160, 160, 160))
            form_sizer.Add(lbl, 0, wx.ALIGN_CENTER_VERTICAL)
            
            if is_choice:
                ctrl = wx.Choice(self, choices=choice_list)
            else:
                ctrl = wx.TextCtrl(self)
                
            ctrl.SetBackgroundColour(wx.Colour(22, 22, 22))
            ctrl.SetForegroundColour(wx.Colour(220, 220, 220))
            ctrl.SetFont(clean_font)
            form_sizer.Add(ctrl, 1, wx.EXPAND)
            return ctrl

        self.txt_name = add_field("Part Name *")
        self.choice_site = add_field("Sourced From *", is_choice=True, choice_list=[
            "Ultra Librarian", "SnapEDA", "SamacSys", "Octopart", "Other"
        ])
        
        self.txt_mfr = add_field("Manufacturer")
        self.txt_mpn = add_field("MPN")
        
        self.txt_pkg = add_field("Package")
        self.txt_datasheet = add_field("Datasheet URL")
        
        self.choice_sym_lib = add_field("Symbol Lib", is_choice=True)
        self.choice_fp_lib = add_field("Footprint Lib", is_choice=True)
        
        # Aliases spans full width at the bottom of the grid
        lbl_aliases = wx.StaticText(self, label="Aliases (CSV)")
        lbl_aliases.SetFont(bold_font)
        lbl_aliases.SetForegroundColour(wx.Colour(160, 160, 160))
        form_sizer.Add(lbl_aliases, 0, wx.ALIGN_CENTER_VERTICAL)
        
        self.txt_aliases = wx.TextCtrl(self)
        self.txt_aliases.SetBackgroundColour(wx.Colour(22, 22, 22))
        self.txt_aliases.SetForegroundColour(wx.Colour(220, 220, 220))
        self.txt_aliases.SetFont(clean_font)
        form_sizer.Add(self.txt_aliases, 1, wx.EXPAND)

        # Empty padding cell for grid alignment
        form_sizer.Add(wx.StaticText(self, label=""), 0)
        form_sizer.Add(wx.StaticText(self, label=""), 0)

        main_sizer.Add(form_sizer, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 15)

        # =====================================================================
        # ROW 4: Action Buttons Bar
        # =====================================================================
        buttons_sizer = wx.BoxSizer(wx.HORIZONTAL)
        
        self.btn_reset = wx.Button(self, label="Reset")
        self.btn_reset.SetFont(bold_font)
        self.btn_reset.SetBackgroundColour(wx.Colour(45, 45, 48))
        self.btn_reset.SetForegroundColour(wx.Colour(200, 200, 200))
        self.btn_reset.Bind(wx.EVT_BUTTON, self.on_reset)
        buttons_sizer.Add(self.btn_reset, 0, wx.RIGHT, 12)

        self.btn_import = wx.Button(self, label="Import Part")
        self.btn_import.SetFont(bold_font)
        self.btn_import.SetBackgroundColour(wx.Colour(255, 85, 0)) # Orange
        self.btn_import.SetForegroundColour(wx.Colour(0, 0, 0))
        self.btn_import.Bind(wx.EVT_BUTTON, self.on_import)
        buttons_sizer.Add(self.btn_import, 0)

        main_sizer.Add(buttons_sizer, 0, wx.ALIGN_RIGHT | wx.RIGHT | wx.BOTTOM, 15)

        self.SetSizer(main_sizer)
        self.Layout()
        self.Centre(wx.BOTH)

    def load_target_libraries(self):
        prefs_dir = self.config['kicadPrefsDir']
        sym_table = os.path.join(prefs_dir, 'sym-lib-table')
        fp_table = os.path.join(prefs_dir, 'fp-lib-table')

        sym_choices = [self.config['customSymbolLib']]
        fp_choices = [self.config['customFootprintLib']]

        if os.path.exists(sym_table):
            try:
                with open(sym_table, 'r', encoding='utf-8') as f:
                    tree = parse_sexpr(f.read())
                if isinstance(tree, list) and tree[0] == 'sym_lib_table':
                    for item in tree[1:]:
                        if isinstance(item, list) and item[0] == 'lib':
                            uri = next((x[1] for x in item[1:] if isinstance(x, list) and x[0] == 'uri'), '')
                            if uri:
                                sym_choices.append(uri)
            except:
                pass

        if os.path.exists(fp_table):
            try:
                with open(fp_table, 'r', encoding='utf-8') as f:
                    tree = parse_sexpr(f.read())
                if isinstance(tree, list) and tree[0] == 'fp_lib_table':
                    for item in tree[1:]:
                        if isinstance(item, list) and item[0] == 'lib':
                            uri = next((x[1] for x in item[1:] if isinstance(x, list) and x[0] == 'uri'), '')
                            if uri:
                                fp_choices.append(uri)
            except:
                pass

        self.choice_sym_lib.SetItems(sym_choices)
        self.choice_sym_lib.SetSelection(0)
        
        self.choice_fp_lib.SetItems(fp_choices)
        self.choice_fp_lib.SetSelection(0)

    # Cross-probing highlight coordination
    def on_symbol_hover(self, pin_num):
        self.canvas_fp.set_external_hover(pin_num)

    def on_footprint_hover(self, pad_num):
        self.canvas_sym.set_external_hover(pad_num)

    def on_browse(self, event):
        wildcard = "PartKit Packages (*.zip;*.kicad_sym;*.kicad_mod)|*.zip;*.kicad_sym;*.kicad_mod"
        dialog = wx.FileDialog(self, "Open Package File", wildcard=wildcard, style=wx.FD_OPEN | wx.FD_FILE_MUST_EXIST)
        if dialog.ShowModal() == wx.ID_OK:
            path = dialog.GetPath()
            self.handle_dropped_file(path)
        dialog.Destroy()

    def handle_dropped_file(self, filepath):
        self.txt_file_path.SetValue(filepath)
        ext = os.path.splitext(filepath)[1].lower()
        
        if ext == '.zip':
            self.load_zip_package(filepath)
        elif ext in ['.kicad_sym', '.lib']:
            self.load_individual_file(filepath, 'sym')
        elif ext == '.kicad_mod':
            self.load_individual_file(filepath, 'fp')
        elif ext in ['.step', '.stp', '.wrl']:
            self.load_individual_file(filepath, '3d')

    def load_zip_package(self, filepath):
        self.active_temp_dir = os.path.join(TEMP_DIR, str(int(datetime.now().timestamp() * 1000)))
        os.makedirs(self.active_temp_dir, exist_ok=True)
        
        try:
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                zip_ref.extractall(self.active_temp_dir)
        except Exception as e:
            wx.MessageBox("Could not extract ZIP package:\n{}".format(e), "Extraction Error", wx.OK | wx.ICON_ERROR)
            return

        for root, dirs, files in os.walk(self.active_temp_dir):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), self.active_temp_dir)
                if f.endswith('.kicad_sym'):
                    self.symbol_file = rel
                elif f.endswith('.kicad_mod'):
                    self.footprint_file = rel
                elif f.endswith('.step') or f.endswith('.stp') or f.endswith('.wrl'):
                    self.model_file = rel

        self.parse_and_refresh()

    def load_individual_file(self, filepath, file_type):
        if not self.active_temp_dir:
            self.active_temp_dir = os.path.join(TEMP_DIR, str(int(datetime.now().timestamp() * 1000)))
            os.makedirs(self.active_temp_dir, exist_ok=True)

        filename = os.path.basename(filepath)
        dest_path = os.path.join(self.active_temp_dir, filename)
        shutil.copyfile(filepath, dest_path)

        if file_type == 'sym':
            self.symbol_file = filename
        elif file_type == 'fp':
            self.footprint_file = filename
        elif file_type == '3d':
            self.model_file = filename

        self.parse_and_refresh()

    def parse_and_refresh(self):
        if self.symbol_file:
            sym_path = os.path.join(self.active_temp_dir, self.symbol_file)
            try:
                with open(sym_path, 'r', encoding='utf-8') as f:
                    tree = parse_sexpr(f.read())
                self.symbol_data = parse_symbol_tree(tree)
            except Exception as e:
                print("Symbol parse error: {}".format(e))
                self.symbol_data = None

        if self.footprint_file:
            fp_path = os.path.join(self.active_temp_dir, self.footprint_file)
            try:
                with open(fp_path, 'r', encoding='utf-8') as f:
                    tree = parse_sexpr(f.read())
                self.footprint_data = parse_footprint_tree(tree)
            except Exception as e:
                print("Footprint parse error: {}".format(e))
                self.footprint_data = None

        part_name = ""
        if self.footprint_data:
            part_name = self.footprint_data['name']
        elif self.symbol_data and self.symbol_data['symbols']:
            part_name = self.symbol_data['symbols'][0]['name']
        elif self.symbol_file:
            part_name = os.path.basename(self.symbol_file).replace('.kicad_sym', '')

        part_name = re.sub(r'[\s(){}[\]:]', '_', part_name)

        if not self.txt_name.GetValue().strip():
            self.txt_name.SetValue(part_name)
            self.txt_mpn.SetValue(part_name)

        self.canvas_sym.set_data(self.symbol_data, self.txt_name.GetValue())
        self.canvas_fp.set_data(self.footprint_data)
        self.canvas_3d.set_model(self.model_file)

        if self.choice_site.GetSelection() == wx.NOT_FOUND:
            self.choice_site.SetSelection(0)

    def on_reset(self, event):
        self.active_temp_dir = ""
        self.symbol_file = None
        self.footprint_file = None
        self.model_file = None
        self.symbol_data = None
        self.footprint_data = None
        
        self.txt_file_path.Clear()
        self.txt_name.Clear()
        self.txt_mfr.Clear()
        self.txt_mpn.Clear()
        self.txt_pkg.Clear()
        self.txt_datasheet.Clear()
        self.txt_aliases.Clear()
        
        self.canvas_sym.set_data(None, "")
        self.canvas_fp.set_data(None)
        self.canvas_3d.set_model(None)

    def on_import(self, event):
        name = self.txt_name.GetValue().strip()
        if not name:
            wx.MessageBox("Component name is required.", "Import Blocked", wx.OK | wx.ICON_WARNING)
            return

        sel_site = self.choice_site.GetString(self.choice_site.GetSelection())
        if not sel_site:
            wx.MessageBox("Please select a Sourced Website.", "Import Blocked", wx.OK | wx.ICON_WARNING)
            return

        written_files = []

        try:
            # 1. Copy 3D Model
            final_3d_path = ""
            model_path = os.path.join(self.active_temp_dir, self.model_file) if self.model_file else None
            if model_path and os.path.exists(model_path):
                ext = os.path.splitext(model_path)[1]
                dest_3d_dir = self.config['custom3DDir']
                os.makedirs(dest_3d_dir, exist_ok=True)
                
                final_3d_path = os.path.join(dest_3d_dir, "{}{}".format(name, ext))
                shutil.copyfile(model_path, final_3d_path)
                written_files.append(final_3d_path)

            # 2. Update and Copy Footprint
            fp_path = os.path.join(self.active_temp_dir, self.footprint_file) if self.footprint_file else None
            if fp_path and os.path.exists(fp_path):
                with open(fp_path, 'r', encoding='utf-8') as f:
                    fp_tree = parse_sexpr(f.read())
                
                if isinstance(fp_tree, list) and fp_tree[0] == 'footprint':
                    fp_tree[1] = name
                    
                    val_prop = next((x for x in fp_tree[2:] if isinstance(x, list) and x[0] == 'property' and x[1] == 'Value'), None)
                    if val_prop:
                        val_prop[2] = name
                        
                    # Inject 3D Model Node
                    model_idx = next((idx for idx, x in enumerate(fp_tree) if isinstance(x, list) and x[0] == 'model'), -1)
                    if final_3d_path:
                        # Direct default scaling/rotation since offsets are removed
                        model_node = [
                            'model',
                            final_3d_path,
                            ['at', ['xyz', 0.0, 0.0, 0.0]],
                            ['scale', ['xyz', 1.0, 1.0, 1.0]],
                            ['rotate', ['xyz', 0.0, 0.0, 0.0]]
                        ]
                        if model_idx != -1:
                            fp_tree[model_idx] = model_node
                        else:
                            fp_tree.append(model_node)
                            
                    dest_fp_lib = self.choice_fp_lib.GetString(self.choice_fp_lib.GetSelection())
                    os.makedirs(dest_fp_lib, exist_ok=True)
                    dest_fp_file = os.path.join(dest_fp_lib, "{}.kicad_mod".format(name))
                    
                    with open(dest_fp_file, 'w', encoding='utf-8') as f:
                        f.write(serialize_sexpr(fp_tree))
                    written_files.append(dest_fp_file)

                    if dest_fp_lib == self.config['customFootprintLib']:
                        register_library_in_table('fp', 'PartKit', self.config['customFootprintLib'], self.config['kicadPrefsDir'])

            # 3. Update and Append Symbol
            sym_path = os.path.join(self.active_temp_dir, self.symbol_file) if self.symbol_file else None
            if sym_path and os.path.exists(sym_path):
                with open(sym_path, 'r', encoding='utf-8') as f:
                    extracted_sym_tree = parse_sexpr(f.read())
                    
                dest_sym_lib = self.choice_sym_lib.GetString(self.choice_sym_lib.GetSelection())
                
                lib_tree = ['kicad_symbol_lib', ['version', 20231129], ['generator', 'PartKit']]
                if os.path.exists(dest_sym_lib):
                    try:
                        with open(dest_sym_lib, 'r', encoding='utf-8') as f:
                            lib_tree = parse_sexpr(f.read())
                    except:
                        pass
                        
                def inject_symbol_node(node):
                    if not isinstance(node, list):
                        return
                    if node[0] == 'symbol':
                        node[1] = name
                        val_prop = next((x for x in node[2:] if isinstance(x, list) and x[0] == 'property' and x[1] == 'Value'), None)
                        if val_prop:
                            val_prop[2] = name
                        
                        fp_name = "PartKit:{}".format(name)
                        fp_prop = next((x for x in node[2:] if isinstance(x, list) and x[0] == 'property' and x[1] == 'Footprint'), None)
                        if fp_prop:
                            fp_prop[2] = fp_name
                            
                        nonlocal lib_tree
                        lib_tree = [c for c in lib_tree if not (isinstance(c, list) and c[0] == 'symbol' and c[1] == name)]
                        lib_tree.append(node)
                    else:
                        for child in node:
                            inject_symbol_node(child)
                            
                if isinstance(extracted_sym_tree, list) and extracted_sym_tree[0] == 'symbol':
                    inject_symbol_node(extracted_sym_tree)
                elif isinstance(extracted_sym_tree, list) and extracted_sym_tree[0] == 'kicad_symbol_lib':
                    for item in extracted_sym_tree[1:]:
                        if isinstance(item, list) and item[0] == 'symbol':
                            inject_symbol_node(item)
                            
                with open(dest_sym_lib, 'w', encoding='utf-8') as f:
                    f.write(serialize_sexpr(lib_tree))
                written_files.append(dest_sym_lib)

                if dest_sym_lib == self.config['customSymbolLib']:
                    register_library_in_table('sym', 'PartKit', self.config['customSymbolLib'], self.config['kicadPrefsDir'])

            # 4. Save index database record
            db = load_database()
            db = [item for item in db if item['name'] != name]
            
            checksum = ""
            if fp_path and os.path.exists(fp_path):
                checksum = get_file_checksum(fp_path)
                
            db.append({
                'name': name,
                'manufacturer': self.txt_mfr.GetValue().strip() or 'Unknown',
                'mpn': self.txt_mpn.GetValue().strip() or name,
                'package': self.txt_pkg.GetValue().strip() or 'Unknown',
                'source': sel_site,
                'version': '1.0.0',
                'importDate': datetime.now().isoformat() + "Z",
                'checksum': checksum,
                'datasheet': self.txt_datasheet.GetValue().strip(),
                'aliases': [x.strip() for x in self.txt_aliases.GetValue().split(',') if x.strip()],
                'symbolLib': 'PartKit' if dest_sym_lib == self.config['customSymbolLib'] else os.path.basename(dest_sym_lib),
                'footprintLib': 'PartKit' if dest_fp_lib == self.config['customFootprintLib'] else os.path.basename(dest_fp_lib),
                'symbolFile': dest_sym_lib,
                'footprintFile': os.path.join(dest_fp_lib, "{}.kicad_mod".format(name)),
                'modelFile': final_3d_path
            })
            save_database_data(db)

            wx.MessageBox("Component '{}' successfully imported into your KiCad libraries!".format(name), "Import Success", wx.OK | wx.ICON_INFORMATION)
            self.on_reset(None)

        except Exception as e:
            for f in written_files:
                try:
                    if os.path.isdir(f):
                        shutil.rmtree(f)
                    else:
                        os.remove(f)
                except:
                    pass
            wx.MessageBox("Failed to import part. Transaction rolled back.\nError: {}".format(e), "Import Failed", wx.OK | wx.ICON_ERROR)

try:
    import pcbnew
except ImportError:
    class MockActionPlugin:
        def register(self): pass
    class MockPcbnew:
        ActionPlugin = MockActionPlugin
    pcbnew = MockPcbnew()

class ActionPartKit(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = "PartKit Importer"
        self.category = "Libraries"
        self.description = "Zero-dependency symbol, footprint and 3D model importer plugin"
        self.show_toolbar_button = True
        self.icon_file_name = os.path.join(PLUGIN_DIR, "icon.png")

    def Run(self):
        dialog = PartKitDialog(None)
        dialog.ShowModal()
        dialog.Destroy()

if __name__ == '__main__':
    class TestApp(wx.App):
        def OnInit(self):
            dialog = PartKitDialog(None)
            dialog.ShowModal()
            dialog.Destroy()
            return True
    app = TestApp()
    app.MainLoop()
