# sexpr.py
import re

KICAD_KEYWORDS = {
    'kicad_symbol_lib', 'version', 'generator', 'symbol', 'pin', 'input', 'output',
    'bidirectional', 'tri_state', 'passive', 'free', 'unspecified', 'power_in',
    'power_out', 'open_collector', 'open_emitter', 'open_emiter', 'line', 'at', 'length',
    'name', 'number', 'effects', 'font', 'size', 'xyz', 'scale', 'rotate', 'footprint',
    'pad', 'smd', 'rect', 'circle', 'oval', 'thru_hole', 'layers', 'model', 'start',
    'end', 'pts', 'xy', 'stroke', 'fill', 'width', 'type', 'layer', 'hide', 'uuid',
    'property', 'descr', 'sym_lib_table', 'fp_lib_table', 'lib', 'options', 'yes', 'no',
    'style', 'color', 'italic', 'bold', 'linewidth', 'drill', 'offset', 'center', 'radius'
}

def parse_sexpr(s: str):
    """
    Parses a KiCad S-expression string into nested Python lists.
    """
    tokens = []
    pattern = re.compile(r'\s*(?:([()])|(?:"((?:[^"\\]|\\.)*)")|([^\s()"]+))')
    pos = 0
    while pos < len(s):
        m = pattern.match(s, pos)
        if not m:
            break
        pos = m.end()
        paren, quoted, symbol = m.groups()
        if paren:
            tokens.append(paren)
        elif quoted is not None:
            unescaped = quoted.replace('\\"', '"').replace('\\\\', '\\')
            tokens.append(unescaped)
        elif symbol is not None:
            try:
                if '.' in symbol:
                    tokens.append(float(symbol))
                else:
                    tokens.append(int(symbol))
            except ValueError:
                tokens.append(symbol)

    def parse_list(token_iter):
        res = []
        for t in token_iter:
            if t == '(':
                res.append(parse_list(token_iter))
            elif t == ')':
                return res
            else:
                res.append(t)
        return res

    iterator = iter(tokens)
    parsed = []
    for t in iterator:
        if t == '(':
            parsed.append(parse_list(iterator))
        elif t == ')':
            pass
        else:
            parsed.append(t)
            
    return parsed[0] if len(parsed) == 1 else parsed

def serialize_sexpr(obj, depth=0, is_head=False) -> str:
    """
    Serializes a nested Python list structure back into a KiCad-compatible S-expression string.
    """
    if isinstance(obj, list):
        if not obj:
            return '()'
        is_simple = not any(isinstance(x, list) for x in obj)
        if is_simple or len(obj) <= 4:
            return '(' + ' '.join(serialize_sexpr(x, 0, idx == 0) for idx, x in enumerate(obj)) + ')'
        else:
            next_indent = '  ' * (depth + 1)
            head = serialize_sexpr(obj[0], 0, True)
            rest_parts = []
            for item in obj[1:]:
                if isinstance(item, list):
                    rest_parts.append('\n' + next_indent + serialize_sexpr(item, depth + 1, False))
                else:
                    rest_parts.append(' ' + serialize_sexpr(item, depth, False))
            return '(' + head + ''.join(rest_parts) + ')'
            
    if isinstance(obj, str):
        if is_head or obj.lower() in KICAD_KEYWORDS:
            return obj
        escaped = obj.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
        
    return str(obj)

def parse_symbol_tree(tree):
    if not isinstance(tree, list) or len(tree) == 0:
        return None
        
    symbols = []
    
    def find_symbols(node, parent_name=None):
        if not isinstance(node, list) or not node:
            return
            
        if node[0] == 'symbol':
            sym_name = node[1]
            pins = []
            properties = {}
            
            for child in node[2:]:
                if not isinstance(child, list) or not child:
                    continue
                if child[0] == 'property':
                    if len(child) >= 3:
                        properties[child[1]] = child[2]
                elif child[0] == 'pin':
                    pin_type = child[1]
                    pin_num = None
                    pin_name = None
                    for sub in child[2:]:
                        if isinstance(sub, list) and sub:
                            if sub[0] == 'name':
                                pin_name = sub[1]
                            elif sub[0] == 'number':
                                pin_num = sub[1]
                    if pin_num is not None:
                        pins.append({
                            'number': str(pin_num),
                            'name': str(pin_name or ''),
                            'type': pin_type
                        })
                elif child[0] == 'symbol':
                    find_symbols(child, sym_name)
                    
            symbols.append({
                'name': sym_name,
                'parent': parent_name,
                'pins': pins,
                'properties': properties
            })
        else:
            for child in node:
                if isinstance(child, list):
                    find_symbols(child)
                    
    find_symbols(tree)
    return {'symbols': symbols}

def parse_footprint_tree(tree):
    if not isinstance(tree, list) or len(tree) == 0:
        return None
        
    if tree[0] != 'footprint':
        return None
        
    fp_name = tree[1]
    pads = []
    model_info = {'path': '', 'offset': {'x': 0, 'y': 0, 'z': 0}, 'rotate': {'x': 0, 'y': 0, 'z': 0}, 'scale': {'x': 1, 'y': 1, 'z': 1}}
    
    for child in tree[2:]:
        if not isinstance(child, list) or not child:
            continue
            
        if child[0] == 'pad':
            pad_num = child[1]
            pad_type = child[2]
            pad_shape = child[3]
            
            at_node = next((x for x in child[4:] if isinstance(x, list) and x[0] == 'at'), None)
            x, y, angle = 0.0, 0.0, 0.0
            if at_node:
                if len(at_node) >= 3:
                    x, y = float(at_node[1]), float(at_node[2])
                if len(at_node) >= 4:
                    angle = float(at_node[3])
                    
            size_node = next((x for x in child[4:] if isinstance(x, list) and x[0] == 'size'), None)
            w, h = 1.2, 1.2
            if size_node and len(size_node) >= 3:
                w, h = float(size_node[1]), float(size_node[2])
                
            pads.append({
                'number': str(pad_num),
                'type': pad_type,
                'shape': pad_shape,
                'x': x,
                'y': y,
                'w': w,
                'h': h,
                'angle': angle
            })

            
        elif child[0] == 'model':
            model_info['path'] = child[1]
            for sub in child[2:]:
                if isinstance(sub, list) and sub:
                    key = sub[0]
                    xyz_node = next((x for x in sub[1:] if isinstance(x, list) and x[0] == 'xyz'), None)
                    if xyz_node and len(xyz_node) >= 4:
                        vals = {'x': float(xyz_node[1]), 'y': float(xyz_node[2]), 'z': float(xyz_node[3])}
                        if key in model_info:
                            model_info[key] = vals
                            
    return {
        'name': fp_name,
        'pads': pads,
        'model': model_info
    }

def validate_component(symbol_data, footprint_data, name: str):
    errors = []
    warnings = []
    
    if not name.strip():
        errors.append("Component name is required.")
    elif not re.match(r'^[A-Za-z0-9_\-\.]+$', name):
        errors.append("Component name contains invalid characters. Use alphanumeric, dashes, and underscores.")
        
    if symbol_data and symbol_data.get('symbols') and footprint_data and footprint_data.get('pads'):
        sym = symbol_data['symbols'][0]
        pin_nums = {p['number'] for p in sym['pins']}
        pad_nums = {p['number'] for p in footprint_data['pads']}
        
        pins_without_pads = pin_nums - pad_nums
        pads_without_pins = pad_nums - pin_nums - {'MP', 'SH'}
        
        if pins_without_pads:
            warnings.append(f"Pin mapping: Symbol has pin(s) [{', '.join(sorted(pins_without_pads))}] missing from footprint.")
        if pads_without_pins:
            warnings.append(f"Pin mapping: Footprint has pad(s) [{', '.join(sorted(pads_without_pins))}] missing from symbol pins.")
            
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }
