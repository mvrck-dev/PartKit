// parser.js
import fs from 'fs';
import path from 'path';

/**
 * Parses a KiCad S-expression string into a JavaScript array structure.
 * @param {string} str - S-expression text
 * @returns {Array|string|number} Parse tree
 */
export function parseSExpr(str) {
  let pos = 0;
  
  function parse() {
    while (pos < str.length && str[pos] <= ' ') pos++; // skip whitespace
    if (pos >= str.length) return null;
    
    if (str[pos] === '(') {
      pos++;
      let list = [];
      while (pos < str.length) {
        while (pos < str.length && str[pos] <= ' ') pos++;
        if (pos >= str.length) break;
        if (str[pos] === ')') {
          pos++;
          return list;
        }
        let item = parse();
        if (item !== null) list.push(item);
      }
      return list;
    } else if (str[pos] === ')') {
      pos++;
      return null;
    } else if (str[pos] === '"') {
      pos++;
      let start = pos;
      while (pos < str.length) {
        if (str[pos] === '"') {
          break;
        }
        if (str[pos] === '\\') {
          pos++; // skip escaped char
        }
        pos++;
      }
      let val = str.substring(start, pos);
      // Unescape characters
      val = val.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      pos++; // skip closing quote
      return val;
    } else {
      let start = pos;
      while (pos < str.length && str[pos] > ' ' && str[pos] !== '(' && str[pos] !== ')') {
        pos++;
      }
      let val = str.substring(start, pos);
      // Try to convert to number if it's numeric
      if (val !== '' && !isNaN(val)) {
        return Number(val);
      }
      return val;
    }
  }
  
  let result = [];
  while (pos < str.length) {
    let item = parse();
    if (item !== null) result.push(item);
    while (pos < str.length && str[pos] <= ' ') pos++;
  }
  return result.length === 1 ? result[0] : (result.length === 0 ? null : result);
}

const KICAD_KEYWORDS = new Set([
  'kicad_symbol_lib', 'version', 'generator', 'symbol', 'pin', 'input', 'output',
  'bidirectional', 'tri_state', 'passive', 'free', 'unspecified', 'power_in',
  'power_out', 'open_collector', 'open_emitter', 'open_emiter', 'line', 'at', 'length',
  'name', 'number', 'effects', 'font', 'size', 'xyz', 'scale', 'rotate', 'footprint',
  'pad', 'smd', 'rect', 'circle', 'oval', 'thru_hole', 'layers', 'model', 'start',
  'end', 'pts', 'xy', 'stroke', 'fill', 'width', 'type', 'layer', 'hide', 'uuid',
  'property', 'descr', 'sym_lib_table', 'fp_lib_table', 'lib', 'options', 'yes', 'no',
  'style', 'color', 'italic', 'bold', 'linewidth', 'drill', 'offset', 'center', 'radius'
]);

/**
 * Serializes a JS array structure back into a KiCad-compatible S-expression string.
 * @param {*} obj - The value/array to serialize
 * @param {number} depth - Indentation depth
 * @returns {string} S-expression string
 */
export function serializeSExpr(obj, depth = 0, isHead = false) {
  if (Array.isArray(obj)) {
    let indent = '  '.repeat(depth);
    
    // Check if it's a simple flat array of tokens or short array
    let isSimple = true;
    for (let item of obj) {
      if (Array.isArray(item)) {
        isSimple = false;
        break;
      }
    }
    
    // Inline simple nodes or short lists (like coords, colors, stroke, font, etc.)
    if (isSimple || obj.length <= 4) {
      return '(' + obj.map((x, idx) => serializeSExpr(x, 0, idx === 0)).join(' ') + ')';
    } else {
      let nextIndent = '  '.repeat(depth + 1);
      let head = serializeSExpr(obj[0], 0, true);
      let rest = obj.slice(1).map(item => {
        if (Array.isArray(item)) {
          return '\n' + nextIndent + serializeSExpr(item, depth + 1, false);
        }
        return ' ' + serializeSExpr(item, depth, false);
      }).join('');
      return '(' + head + rest + ')';
    }
  }
  
  if (typeof obj === 'string') {
    // If it's a known keyword token or it's the head of a list, keep it unquoted
    if (isHead || KICAD_KEYWORDS.has(obj.toLowerCase())) {
      return obj;
    }
    
    // Otherwise, wrap in quotes
    let escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '"' + escaped + '"';
  }
  
  return String(obj);
}


/**
 * Extracts pins and graphics from a KiCad Symbol S-expression.
 * Supports KiCad v6+ (.kicad_sym) format.
 * @param {Array} tree - Parsed symbol S-expression tree
 * @returns {Object} Extracted symbol metadata
 */
export function parseSymbolTree(tree) {
  // A .kicad_sym file has top element (kicad_symbol_lib ... (symbol "NAME" ...))
  if (!tree || !Array.isArray(tree)) return null;
  
  let libraryName = '';
  let symbols = [];
  
  if (tree[0] === 'kicad_symbol_lib') {
    // Find nested symbol nodes
    for (let i = 1; i < tree.length; i++) {
      let child = tree[i];
      if (Array.isArray(child) && child[0] === 'symbol') {
        symbols.push(extractSymbolData(child));
      }
    }
  } else if (tree[0] === 'symbol') {
    symbols.push(extractSymbolData(tree));
  }
  
  return {
    isV6: true,
    symbols: symbols
  };
}

function extractSymbolData(symbolNode) {
  let name = symbolNode[1];
  let pins = [];
  let graphics = [];
  let properties = {};
  
  // Recursively extract from symbol node and any sub-symbols (units/gates)
  function extract(node) {
    if (!Array.isArray(node)) return;
    
    // Check if it's a sub-symbol definition
    if (node[0] === 'symbol') {
      for (let i = 2; i < node.length; i++) {
        extract(node[i]);
      }
      return;
    }
    
    if (node[0] === 'property') {
      // (property "Name" "Value" (at x y) ...)
      let key = node[1];
      let val = node[2];
      properties[key] = val;
    } else if (node[0] === 'pin') {
      // (pin type shape (at x y angle) (name "NAME" ...) (number "NUM" ...))
      let type = node[1];
      let shape = node[2];
      let atNode = node.find(c => Array.isArray(c) && c[0] === 'at');
      let nameNode = node.find(c => Array.isArray(c) && c[0] === 'name');
      let numberNode = node.find(c => Array.isArray(c) && c[0] === 'number');
      
      let x = 0, y = 0, angle = 0;
      if (atNode) {
        x = atNode[1] || 0;
        y = atNode[2] || 0;
        angle = atNode[3] || 0;
      }
      
      let pinName = nameNode ? nameNode[1] : '';
      let pinNum = numberNode ? numberNode[1] : '';
      
      pins.push({
        type,
        shape,
        x,
        y: -y, // Negated for standard screen coordinates
        angle,
        name: pinName,
        number: String(pinNum)
      });
    } else if (['property', 'pin', 'symbol'].indexOf(node[0]) === -1) {
      // Graphics elements: rectangle, polyline, circle, arc, text
      // (rectangle (start x y) (end x y) (stroke ...) (fill ...))
      // (polyline (pts (xy x y) (xy x y) ...) ...)
      let type = node[0];
      if (['rectangle', 'polyline', 'circle', 'arc', 'text'].indexOf(type) !== -1) {
        graphics.push({
          type,
          data: node
        });
      }
    }
  }
  
  for (let i = 2; i < symbolNode.length; i++) {
    extract(symbolNode[i]);
  }
  
  return {
    name,
    properties,
    pins,
    graphics
  };
}

/**
 * Extracts pads, outlines, and 3D model properties from a KiCad footprint S-expression.
 * @param {Array} tree - Parsed footprint S-expression
 * @returns {Object} Extracted footprint metadata
 */
export function parseFootprintTree(tree) {
  if (!tree || !Array.isArray(tree) || tree[0] !== 'footprint') return null;
  
  let name = tree[1];
  let pads = [];
  let graphics = [];
  let model = { path: '', offset: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotate: { x: 0, y: 0, z: 0 } };
  
  for (let i = 2; i < tree.length; i++) {
    let node = tree[i];
    if (!Array.isArray(node)) continue;
    
    if (node[0] === 'pad') {
      // (pad "1" smd rect (at x y angle) (size w h) (layers ...))
      let number = String(node[1]);
      let type = node[2];
      let shape = node[3];
      
      let atNode = node.find(c => Array.isArray(c) && c[0] === 'at');
      let sizeNode = node.find(c => Array.isArray(c) && c[0] === 'size');
      let layersNode = node.find(c => Array.isArray(c) && c[0] === 'layers');
      
      let x = 0, y = 0, angle = 0;
      if (atNode) {
        x = atNode[1] || 0;
        y = atNode[2] || 0;
        angle = atNode[3] || 0;
      }
      
      let w = 0, h = 0;
      if (sizeNode) {
        w = sizeNode[1] || 0;
        h = sizeNode[2] || 0;
      }
      
      let layers = layersNode ? layersNode.slice(1) : [];
      
      pads.push({
        number,
        type,
        shape,
        x,
        y,
        angle,
        w,
        h,
        layers
      });
    } else if (['fp_line', 'fp_rect', 'fp_circle', 'fp_arc', 'fp_poly', 'fp_text'].indexOf(node[0]) !== -1) {
      graphics.push({
        type: node[0],
        data: node
      });
    } else if (node[0] === 'model') {
      // (model "path/to/3d.wrl" (at (xyz x y z)) (scale (xyz sx sy sz)) (rotate (xyz rx ry rz)))
      model.path = node[1] || '';
      
      let atNode = node.find(c => Array.isArray(c) && c[0] === 'at');
      let scaleNode = node.find(c => Array.isArray(c) && c[0] === 'scale');
      let rotateNode = node.find(c => Array.isArray(c) && c[0] === 'rotate');
      
      if (atNode && Array.isArray(atNode[1]) && atNode[1][0] === 'xyz') {
        model.offset.x = atNode[1][1] || 0;
        model.offset.y = atNode[1][2] || 0;
        model.offset.z = atNode[1][3] || 0;
      }
      if (scaleNode && Array.isArray(scaleNode[1]) && scaleNode[1][0] === 'xyz') {
        model.scale.x = scaleNode[1][1] || 1;
        model.scale.y = scaleNode[1][2] || 1;
        model.scale.z = scaleNode[1][3] || 1;
      }
      if (rotateNode && Array.isArray(rotateNode[1]) && rotateNode[1][0] === 'xyz') {
        model.rotate.x = rotateNode[1][1] || 0;
        model.rotate.y = rotateNode[1][2] || 0;
        model.rotate.z = rotateNode[1][3] || 0;
      }
    }
  }
  
  return {
    name,
    pads,
    graphics,
    model
  };
}

/**
 * Legacy KiCad library file (.lib) parser for pin outs
 * Useful as fallback for older libraries.
 */
export function parseLegacyLib(content) {
  let symbols = [];
  let lines = content.split('\n');
  let currentSymbol = null;
  
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('DEF ')) {
      let parts = line.split(/\s+/);
      currentSymbol = {
        name: parts[1],
        pins: [],
        graphics: [],
        properties: {}
      };
    } else if (line === 'ENDDEF' && currentSymbol) {
      symbols.push(currentSymbol);
      currentSymbol = null;
    } else if (currentSymbol && line.startsWith('X ')) {
      // X Name Number X_coord Y_coord Length Direction NameSize NumSize Unit Convert Type [Shape]
      let parts = line.split(/\s+/);
      let name = parts[1] === '~' ? '' : parts[1];
      let num = parts[2];
      let x = parseFloat(parts[3]) || 0;
      let y = parseFloat(parts[4]) || 0;
      let angle = parts[7] === 'U' ? 90 : (parts[7] === 'D' ? 270 : (parts[7] === 'L' ? 180 : 0));
      
      currentSymbol.pins.push({
        name,
        number: String(num),
        x: x * 0.0254, // Convert mil to mm if legacy
        y: -y * 0.0254, // Convert and invert
        angle,
        type: parts[11] || 'input',
        shape: parts[12] || 'line'
      });
    }
  }
  
  return {
    isV6: false,
    symbols
  };
}

/**
 * Dynamic S-expression validation logic comparing pins vs pads and detecting duplicates.
 * @returns {Object} Validation status
 */
export function validateComponent(symbol, footprint, targetSymbolPath, targetFootprintPath, newName) {
  const errors = [];
  const warnings = [];

  if (!newName || !newName.trim()) {
    errors.push("Component name is required.");
  } else if (!/^[A-Za-z0-9_\-\.]+$/.test(newName)) {
    errors.push("Component name contains invalid characters. Use alphanumeric, dashes, and underscores.");
  }

  // 1. Pin-to-Pad matching
  if (symbol && symbol.symbols && symbol.symbols[0] && footprint && footprint.pads) {
    const pinNums = new Set(symbol.symbols[0].pins.map(p => String(p.number)));
    const padNums = new Set(footprint.pads.map(p => String(p.number)));

    const pinsWithoutPads = [...pinNums].filter(p => !padNums.has(p));
    const padsWithoutPins = [...padNums].filter(p => !pinNums.has(p) && p !== 'MP' && p !== 'SH'); // ignore shield / mounting pads

    if (pinsWithoutPads.length > 0) {
      warnings.push(`Pin mapping alert: Symbol has pin(s) [${pinsWithoutPads.join(', ')}] which are missing from the footprint pads.`);
    }
    if (padsWithoutPins.length > 0) {
      warnings.push(`Pin mapping alert: Footprint has pad(s) [${padsWithoutPins.join(', ')}] which are missing from the symbol pins.`);
    }
  }

  // 2. Duplicate detection
  if (newName) {
    // Check target symbol library S-expr file
    if (targetSymbolPath && fs.existsSync(targetSymbolPath)) {
      try {
        const content = fs.readFileSync(targetSymbolPath, 'utf8');
        const tree = parseSExpr(content);
        if (tree && Array.isArray(tree) && tree[0] === 'kicad_symbol_lib') {
          const exists = tree.some(c => Array.isArray(c) && c[0] === 'symbol' && c[1] === newName);
          if (exists) {
            warnings.push(`Duplicate: Symbol "${newName}" already exists in the selected symbol library.`);
          }
        }
      } catch (_) {}
    }

    // Check target footprint library folder
    if (targetFootprintPath && fs.existsSync(targetFootprintPath)) {
      const fpFilePath = path.join(targetFootprintPath, `${newName}.kicad_mod`);
      if (fs.existsSync(fpFilePath)) {
        warnings.push(`Duplicate: Footprint "${newName}" already exists in the selected footprint library folder.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
