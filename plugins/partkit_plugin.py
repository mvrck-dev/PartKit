# partkit_plugin.py
import pcbnew
import webbrowser
import urllib.request
import subprocess
import os
import sys

# Try importing wx and wx.html2 for native embedded browser window support
WX_AVAILABLE = False
try:
    import wx
    import wx.html2 as webview
    WX_AVAILABLE = True
except ImportError:
    pass

BaseDialog = wx.Dialog if WX_AVAILABLE else object

class PartKitDialog(BaseDialog):
    def __init__(self, parent):
        if WX_AVAILABLE:
            # Set size matching a modern full-screen desktop dashboard preview layout
            super(PartKitDialog, self).__init__(
                parent, 
                title="PartKit Component Importer & Syncer", 
                size=(1280, 850),
                style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER | wx.MAXIMIZE_BOX
            )
            
            sizer = wx.BoxSizer(wx.VERTICAL)
            
            # Instantiate the native embedded WebView wrapper
            self.browser = webview.WebView.New(self)
            sizer.Add(self.browser, 1, wx.EXPAND)
            
            self.SetSizer(sizer)
            self.Centre()
            
            # Load local server dashboard
            self.browser.LoadURL("http://localhost:3010")

class PartKitPlugin(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = "PartKit Importer"
        self.category = "Component Utility"
        self.description = "Launch PartKit Component Importer & Syncer for Ultra Librarian, SnapEDA, etc."
        self.show_toolbar_button = True
        self.icon_file_name = ""  # Can be associated with an icon PNG (26x26)

    def Run(self):
        # 1. Test if the PartKit server is already running on http://localhost:3010
        server_running = False
        try:
            req = urllib.request.Request("http://localhost:3010/api/kicad/config")
            with urllib.request.urlopen(req, timeout=1) as response:
                if response.status == 200:
                    server_running = True
        except Exception:
            pass

        # 2. If not running, attempt to spawn the local Node server in the background
        if not server_running:
            project_dir = os.path.dirname(os.path.realpath(__file__))
            
            # If loaded from within the 'plugins' subdirectory in PCM setup, get parent directory
            if os.path.basename(project_dir) == 'plugins':
                project_dir = os.path.dirname(project_dir)

            env = os.environ.copy()
            if "/opt/homebrew/bin" not in env.get("PATH", ""):
                env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + env.get("PATH", "")

            try:
                # Launch node server.js directly using background process spawning
                if sys.platform == 'win32':
                    subprocess.Popen(
                        ["node", "server.js"],
                        cwd=project_dir,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                        env=env
                    )
                else:
                    subprocess.Popen(
                        ["node", "server.js"],
                        cwd=project_dir,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True,
                        env=env
                    )
            except Exception:
                try:
                    if sys.platform == 'win32':
                        subprocess.Popen(
                            ["npm", "run", "server"],
                            cwd=project_dir,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW,
                            env=env
                        )
                    else:
                        subprocess.Popen(
                            ["npm", "run", "server"],
                            cwd=project_dir,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            start_new_session=True,
                            env=env
                        )
                except Exception:
                    pass

            # Wait a brief moment for server to start before load
            import time
            time.sleep(1.0)

        # 3. Open Dialog within KiCad or fall back to system web browser
        if WX_AVAILABLE:
            try:
                # Launch the native embedded dialog inside KiCad's window thread
                dlg = PartKitDialog(None)
                dlg.ShowModal()
                dlg.Destroy()
            except Exception as e:
                # Fallback to browser if wx.html2 initialization fails
                webbrowser.open("http://localhost:3010")
        else:
            # Standalone fallback browser loading
            webbrowser.open("http://localhost:3010")

# Register the plugin inside KiCad Action Plugins manager
PartKitPlugin().register()
