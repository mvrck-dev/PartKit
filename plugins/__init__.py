# plugins/__init__.py
import os
import sys

try:
    # Perform relative import of PartKitPlugin class
    from .partkit_plugin import PartKitPlugin
    # Register plugin within KiCad's pcbnew environment
    PartKitPlugin().register()
except Exception as e:
    import traceback
    # Write a diagnostics log if KiCad's python scanner fails
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "error.log")
    with open(log_path, "w") as f:
        traceback.print_exc(file=f)
