// server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import admZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { parseSExpr, serializeSExpr, parseSymbolTree, parseFootprintTree, parseLegacyLib, validateComponent } from './parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3010;

app.use(cors());
app.use(express.json());

// Set up temporary directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TEMP_EXTRACT_DIR = path.join(__dirname, 'extracted');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(TEMP_EXTRACT_DIR)) fs.mkdirSync(TEMP_EXTRACT_DIR);

const upload = multer({ dest: UPLOAD_DIR });

// Default KiCad Config Directory
const getKicadPrefsDir = () => {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Preferences', 'kicad', '10.0');
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'kicad', '10.0');
  } else {
    return path.join(home, '.config', 'kicad', '10.0');
  }
};

let config = {
  kicadPrefsDir: getKicadPrefsDir(),
  customSymbolLib: path.join(__dirname, 'libraries', 'PartKit.kicad_sym'),
  customFootprintLib: path.join(__dirname, 'libraries', 'PartKit.pretty'),
  custom3DDir: path.join(__dirname, 'libraries', 'PartKit.3dshapes'),
  logs: []
};

// Log logger
function logMessage(level, message) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const logStr = `[${timestamp}] [${level}] ${message}`;
  console.log(logStr);
  config.logs.push({ timestamp, level, message });
  if (config.logs.length > 500) {
    config.logs.shift();
  }
}

// Database Paths
const DB_PATH = path.join(__dirname, 'libraries', 'database.json');

// Initialize database
function getDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// Helper to compute SHA-256 checksums
function getFileChecksum(filePath) {
  if (!fs.existsSync(filePath)) return '';
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (_) {
    return '';
  }
}

// Initialize custom libraries directories
const initLibraries = () => {
  const libDir = path.dirname(config.customSymbolLib);
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  if (!fs.existsSync(config.customFootprintLib)) fs.mkdirSync(config.customFootprintLib, { recursive: true });
  if (!fs.existsSync(config.custom3DDir)) fs.mkdirSync(config.custom3DDir, { recursive: true });
  
  // Make sure database.json is created
  if (!fs.existsSync(DB_PATH)) {
    saveDatabase([]);
  }
};
initLibraries();

// Get config
app.get('/api/kicad/config', (req, res) => {
  res.json({
    kicadPrefsDir: config.kicadPrefsDir,
    customSymbolLib: config.customSymbolLib,
    customFootprintLib: config.customFootprintLib,
    custom3DDir: config.custom3DDir
  });
});

// Update config
app.post('/api/kicad/config', (req, res) => {
  const { kicadPrefsDir, customSymbolLib, customFootprintLib, custom3DDir } = req.body;
  if (kicadPrefsDir) config.kicadPrefsDir = kicadPrefsDir;
  if (customSymbolLib) config.customSymbolLib = customSymbolLib;
  if (customFootprintLib) config.customFootprintLib = customFootprintLib;
  if (custom3DDir) config.custom3DDir = custom3DDir;
  
  initLibraries();
  logMessage('INFO', `Configuration updated successfully.`);
  res.json({ success: true, config });
});

// Read active logs
app.get('/api/logs', (req, res) => {
  res.json(config.logs);
});

// Clear logs
app.post('/api/logs/clear', (req, res) => {
  config.logs = [];
  res.json({ success: true });
});



// List libraries from tables (including global and project-local discovery)
app.get('/api/kicad/libraries', (req, res) => {
  logMessage('INFO', `Fetching KiCad libraries from tables.`);
  
  let symbolLibs = [];
  let footprintLibs = [];
  
  // Include custom local ones at the top
  symbolLibs.push({ name: 'PartKit (Local)', uri: config.customSymbolLib, type: 'local' });
  footprintLibs.push({ name: 'PartKit.pretty (Local)', uri: config.customFootprintLib, type: 'local' });

  // Define tables search list (global first, then project-local)
  const tables = [
    { type: 'global', sym: path.join(config.kicadPrefsDir, 'sym-lib-table'), fp: path.join(config.kicadPrefsDir, 'fp-lib-table') },
    { type: 'project', sym: path.join(__dirname, 'sym-lib-table'), fp: path.join(__dirname, 'fp-lib-table') }
  ];

  tables.forEach(t => {
    // Read sym-lib-table
    if (fs.existsSync(t.sym)) {
      try {
        const symContent = fs.readFileSync(t.sym, 'utf8');
        const symTree = parseSExpr(symContent);
        if (symTree && Array.isArray(symTree) && symTree[0] === 'sym_lib_table') {
          for (let i = 1; i < symTree.length; i++) {
            const item = symTree[i];
            if (Array.isArray(item) && item[0] === 'lib') {
              const nameNode = item.find(c => Array.isArray(c) && c[0] === 'name');
              const uriNode = item.find(c => Array.isArray(c) && c[0] === 'uri');
              if (nameNode && uriNode) {
                // Prevent duplicate display of PartKit itself
                if (nameNode[1] !== 'PartKit') {
                  symbolLibs.push({ name: `${nameNode[1]} (${t.type === 'project' ? 'Project' : 'Global'})`, uri: uriNode[1], type: t.type });
                }
              }
            }
          }
        }
      } catch (e) {
        logMessage('WARN', `Could not parse ${t.type} sym-lib-table: ${e.message}`);
      }
    }

    // Read fp-lib-table
    if (fs.existsSync(t.fp)) {
      try {
        const fpContent = fs.readFileSync(t.fp, 'utf8');
        const fpTree = parseSExpr(fpContent);
        if (fpTree && Array.isArray(fpTree) && fpTree[0] === 'fp_lib_table') {
          for (let i = 1; i < fpTree.length; i++) {
            const item = fpTree[i];
            if (Array.isArray(item) && item[0] === 'lib') {
              const nameNode = item.find(c => Array.isArray(c) && c[0] === 'name');
              const uriNode = item.find(c => Array.isArray(c) && c[0] === 'uri');
              if (nameNode && uriNode) {
                if (nameNode[1] !== 'PartKit') {
                  footprintLibs.push({ name: `${nameNode[1]} (${t.type === 'project' ? 'Project' : 'Global'})`, uri: uriNode[1], type: t.type });
                }
              }
            }
          }
        }
      } catch (e) {
        logMessage('WARN', `Could not parse ${t.type} fp-lib-table: ${e.message}`);
      }
    }
  });

  res.json({ symbolLibs, footprintLibs });
});

// Upload ZIP endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    logMessage('ERROR', 'Upload failed: No file received.');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const zipPath = req.file.path;
  const originalName = req.file.originalname;
  logMessage('INFO', `Received component package zip: ${originalName}`);

  const extractSubDir = path.join(TEMP_EXTRACT_DIR, `${Date.now()}_${path.basename(zipPath)}`);
  fs.mkdirSync(extractSubDir);

  try {
    const zip = new admZip(zipPath);
    zip.extractAllTo(extractSubDir, true);
    logMessage('INFO', `Extracted package to temporary workspace: ${extractSubDir}`);
    
    // Scan extracted files recursively
    const files = [];
    const scanDir = (dir) => {
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          scanDir(fullPath);
        } else {
          files.push({
            name: file,
            relativePath: path.relative(extractSubDir, fullPath),
            fullPath: fullPath,
            size: stat.size
          });
        }
      });
    };
    scanDir(extractSubDir);

    // Find symbol, footprint, and 3D files
    let symbolFile = null;
    let footprintFile = null;
    let modelFile = null;

    for (let f of files) {
      if (f.name.endsWith('.kicad_sym') || f.name.endsWith('.lib')) {
        symbolFile = f;
      } else if (f.name.endsWith('.kicad_mod')) {
        footprintFile = f;
      } else if (f.name.endsWith('.step') || f.name.endsWith('.stp') || f.name.endsWith('.wrl')) {
        modelFile = f;
      }
    }

    let parsedSymbol = null;
    let parsedFootprint = null;

    if (symbolFile) {
      const content = fs.readFileSync(symbolFile.fullPath, 'utf8');
      if (symbolFile.name.endsWith('.kicad_sym')) {
        const tree = parseSExpr(content);
        parsedSymbol = parseSymbolTree(tree);
      } else {
        parsedSymbol = parseLegacyLib(content);
      }
    }

    if (footprintFile) {
      const content = fs.readFileSync(footprintFile.fullPath, 'utf8');
      const tree = parseSExpr(content);
      parsedFootprint = parseFootprintTree(tree);
    }

    // Run initial validations relative to defaults
    const initialName = (parsedFootprint?.name || parsedSymbol?.symbols?.[0]?.name || originalName.replace('.zip', '')).replace(/[\s\(\)\{\}\[\]\:]/g, '_');
    const validation = validateComponent(
      parsedSymbol,
      parsedFootprint,
      config.customSymbolLib,
      config.customFootprintLib,
      initialName
    );

    res.json({
      success: true,
      files: files.map(f => ({ name: f.name, relativePath: f.relativePath })),
      symbolFile: symbolFile ? symbolFile.relativePath : null,
      footprintFile: footprintFile ? footprintFile.relativePath : null,
      modelFile: modelFile ? modelFile.relativePath : null,
      symbol: parsedSymbol,
      footprint: parsedFootprint,
      tempDir: extractSubDir,
      validation
    });

  } catch (e) {
    logMessage('ERROR', `Error processing zip: ${e.message}`);
    res.status(500).json({ error: e.message });
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}
  }
});

// Import component endpoint with Validation and Transaction Rollback
app.post('/api/import', (req, res) => {
  const {
    tempDir,
    symbolFile,
    footprintFile,
    modelFile,
    newName,
    sourceSite,
    targetSymbolLib,
    targetFootprintLib,
    target3DDir,
    offset,
    rotate,
    scale,
    metadata // manufacturer, mpn, package, datasheet, aliases
  } = req.body;

  logMessage('INFO', `Running pre-import validation for part "${newName}"`);

  // 1. Fetch structures for strict validation check
  const symbolPath = symbolFile ? path.join(tempDir, symbolFile) : null;
  const footprintPath = footprintFile ? path.join(tempDir, footprintFile) : null;
  const modelPath = modelFile ? path.join(tempDir, modelFile) : null;

  let symbolData = null;
  let footprintData = null;

  if (symbolPath && fs.existsSync(symbolPath)) {
    const content = fs.readFileSync(symbolPath, 'utf8');
    if (symbolPath.endsWith('.kicad_sym')) {
      symbolData = parseSymbolTree(parseSExpr(content));
    } else {
      symbolData = parseLegacyLib(content);
    }
  }

  if (footprintPath && fs.existsSync(footprintPath)) {
    const content = fs.readFileSync(footprintPath, 'utf8');
    footprintData = parseFootprintTree(parseSExpr(content));
  }

  const destSymLib = targetSymbolLib || config.customSymbolLib;
  const destFpLib = targetFootprintLib || config.customFootprintLib;

  // Run atomic validation check
  const validation = validateComponent(
    symbolData,
    footprintData,
    destSymLib,
    destFpLib,
    newName
  );

  if (!validation.valid) {
    logMessage('ERROR', `Import blocked: Validation failed. Errors: ${validation.errors.join(', ')}`);
    return res.status(400).json({ success: false, error: 'Validation failed', errors: validation.errors });
  }

  logMessage('INFO', `Pre-import validation passed. Initiating installation transaction.`);

  // Keep track of written files for rollback transaction
  const writtenFiles = [];

  try {
    // 2. Copy 3D Model
    let final3DPath = '';
    if (modelPath && fs.existsSync(modelPath)) {
      const ext = path.extname(modelPath);
      const dest3DDir = target3DDir || config.custom3DDir;
      if (!fs.existsSync(dest3DDir)) {
        fs.mkdirSync(dest3DDir, { recursive: true });
      }
      
      const new3DFileName = `${newName}${ext}`;
      const finalDest3D = path.join(dest3DDir, new3DFileName);
      fs.copyFileSync(modelPath, finalDest3D);
      writtenFiles.push(finalDest3D);
      logMessage('SUCCESS', `Copied 3D model to: ${finalDest3D}`);
      final3DPath = finalDest3D;
    }

    // 3. Process & Copy Footprint
    if (footprintPath && fs.existsSync(footprintPath)) {
      const fpContent = fs.readFileSync(footprintPath, 'utf8');
      const fpTree = parseSExpr(fpContent);
      
      if (fpTree && Array.isArray(fpTree) && fpTree[0] === 'footprint') {
        fpTree[1] = newName;

        let valProp = fpTree.find(c => Array.isArray(c) && c[0] === 'property' && c[1] === 'Value');
        if (valProp) valProp[2] = newName;

        let modelNodeIndex = fpTree.findIndex(c => Array.isArray(c) && c[0] === 'model');
        
        if (final3DPath) {
          const modelNode = [
            'model',
            final3DPath,
            ['at', ['xyz', offset.x, offset.y, offset.z]],
            ['scale', ['xyz', scale.x, scale.y, scale.z]],
            ['rotate', ['xyz', rotate.x, rotate.y, rotate.z]]
          ];
          
          if (modelNodeIndex !== -1) {
            fpTree[modelNodeIndex] = modelNode;
          } else {
            fpTree.push(modelNode);
          }
        }

        if (!fs.existsSync(destFpLib)) {
          fs.mkdirSync(destFpLib, { recursive: true });
        }
        
        const destFpFile = path.join(destFpLib, `${newName}.kicad_mod`);
        const serializedFp = serializeSExpr(fpTree);
        fs.writeFileSync(destFpFile, serializedFp, 'utf8');
        writtenFiles.push(destFpFile);
        logMessage('SUCCESS', `Saved updated footprint: ${destFpFile}`);

        if (destFpLib === config.customFootprintLib) {
          registerLibraryInTable('fp', 'PartKit', config.customFootprintLib);
        }
      }
    }

    // 4. Process & Copy Symbol
    let originalSymbolContent = null;
    if (symbolPath && fs.existsSync(symbolPath)) {
      const symContent = fs.readFileSync(symbolPath, 'utf8');
      
      const libDir = path.dirname(destSymLib);
      if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
      }

      if (symbolPath.endsWith('.kicad_sym')) {
        const tree = parseSExpr(symContent);
        if (tree && Array.isArray(tree) && tree[0] === 'kicad_symbol_lib') {
          let symBlock = tree.find(c => Array.isArray(c) && c[0] === 'symbol');
          if (symBlock) {
            symBlock[1] = newName;

            for (let i = 2; i < symBlock.length; i++) {
              let child = symBlock[i];
              if (Array.isArray(child) && child[0] === 'symbol') {
                const childOldName = child[1];
                const prefixIndex = childOldName.indexOf('_');
                if (prefixIndex !== -1) {
                  child[1] = `${newName}${childOldName.substring(prefixIndex)}`;
                } else {
                  child[1] = `${newName}_1_1`;
                }
              }
            }

            let valProp = symBlock.find(c => Array.isArray(c) && c[0] === 'property' && c[1] === 'Value');
            if (valProp) valProp[2] = newName;

            let fpLibName = 'PartKit';
            if (destFpLib !== config.customFootprintLib) {
              fpLibName = path.basename(destFpLib, '.pretty');
            }
            const fpReference = `${fpLibName}:${newName}`;
            
            let fpProp = symBlock.find(c => Array.isArray(c) && c[0] === 'property' && c[1] === 'Footprint');
            if (fpProp) {
              fpProp[2] = fpReference;
            } else {
              symBlock.push(['property', 'Footprint', fpReference, ['at', 0, 0, 0], ['effects', ['font', ['size', 1.27, 1.27]], 'hide']]);
            }
            
            // Handle backup of symlib before modify
            let targetLibTree = ['kicad_symbol_lib', ['version', 20231129], ['generator', 'PartKit']];
            if (fs.existsSync(destSymLib)) {
              try {
                originalSymbolContent = fs.readFileSync(destSymLib, 'utf8');
                const parsedExisting = parseSExpr(originalSymbolContent);
                if (parsedExisting && Array.isArray(parsedExisting) && parsedExisting[0] === 'kicad_symbol_lib') {
                  targetLibTree = parsedExisting;
                }
              } catch (_) {}
            }

            let existingIdx = targetLibTree.findIndex(c => Array.isArray(c) && c[0] === 'symbol' && c[1] === newName);
            if (existingIdx !== -1) {
              targetLibTree.splice(existingIdx, 1);
            }

            targetLibTree.push(symBlock);
            
            const serializedSym = serializeSExpr(targetLibTree);
            fs.writeFileSync(destSymLib, serializedSym, 'utf8');
            logMessage('SUCCESS', `Saved updated symbol inside library: ${destSymLib}`);

            if (destSymLib === config.customSymbolLib) {
              registerLibraryInTable('sym', 'PartKit', config.customSymbolLib);
            }
          }
        }
      } else {
        // Legacy fallback
        fs.appendFileSync(destSymLib, symContent, 'utf8');
        logMessage('SUCCESS', `Appended legacy symbol into library: ${destSymLib}`);
      }
    }

    // 5. Index Component in database
    const db = getDatabase();
    const finalDestFp = path.join(destFpLib, `${newName}.kicad_mod`);
    
    // Compute checksum (use checksum of footprint or model file)
    const checksum = getFileChecksum(finalDestFp);
    
    const dbRecord = {
      name: newName,
      manufacturer: metadata?.manufacturer || 'Unknown',
      mpn: metadata?.mpn || newName,
      package: metadata?.package || footprintData?.name || 'Unknown',
      source: sourceSite || 'Unknown',
      version: metadata?.version || '1.0.0',
      importDate: new Date().toISOString(),
      checksum,
      datasheet: metadata?.datasheet || '',
      aliases: metadata?.aliases ? metadata.aliases.split(',').map(x => x.trim()) : [],
      symbolLib: path.basename(destSymLib, '.kicad_sym'),
      footprintLib: path.basename(destFpLib, '.pretty'),
      symbolFile: destSymLib,
      footprintFile: finalDestFp,
      modelFile: final3DPath
    };

    // Replace if duplicate name in db
    const dupIdx = db.findIndex(c => c.name === newName);
    if (dupIdx !== -1) {
      db[dupIdx] = dbRecord;
    } else {
      db.push(dbRecord);
    }
    saveDatabase(db);
    logMessage('SUCCESS', `Component metadata registered in local index.`);

    // Clean up temporary workspace
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}

    logMessage('SUCCESS', `Component "${newName}" successfully installed atomically.`);
    res.json({ success: true, message: 'Import completed successfully' });

  } catch (e) {
    logMessage('ERROR', `Transaction aborted due to error: ${e.message}. Rolling back writes...`);
    
    // ROLLBACK transaction: delete any written files
    writtenFiles.forEach(f => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    });

    // Rollback symbol library file modify if backup existed
    if (originalSymbolContent !== null && fs.existsSync(destSymLib)) {
      try {
        fs.writeFileSync(destSymLib, originalSymbolContent, 'utf8');
      } catch (_) {}
    }

    res.status(500).json({ error: `Import failed: ${e.message}` });
  }
});

// Database components query endpoint
app.get('/api/components', (req, res) => {
  const q = req.query.q;
  const db = getDatabase();
  
  if (!q || typeof q !== 'string') {
    return res.json(db);
  }

  const query = q.toLowerCase();
  const filtered = db.filter(item => 
    item.name.toLowerCase().includes(query) ||
    item.manufacturer.toLowerCase().includes(query) ||
    item.mpn.toLowerCase().includes(query) ||
    item.package.toLowerCase().includes(query) ||
    item.source.toLowerCase().includes(query) ||
    item.aliases.some(a => a.toLowerCase().includes(query))
  );

  res.json(filtered);
});

// Register library helper
function registerLibraryInTable(type, libName, libPath) {
  const tableFile = type === 'sym' ? 'sym-lib-table' : 'fp-lib-table';
  const tablePath = path.join(config.kicadPrefsDir, tableFile);
  
  if (!fs.existsSync(tablePath)) {
    logMessage('WARN', `Cannot register library: table file not found at ${tablePath}`);
    return;
  }

  try {
    const content = fs.readFileSync(tablePath, 'utf8');
    const tree = parseSExpr(content);
    const rootToken = type === 'sym' ? 'sym_lib_table' : 'fp_lib_table';

    
    if (tree && Array.isArray(tree) && tree[0] === rootToken) {
      const isRegistered = tree.some(c => Array.isArray(c) && c[0] === 'lib' && c.some(p => Array.isArray(p) && p[0] === 'name' && p[1] === libName));
      
      if (isRegistered) return;
      
      const libNode = [
        'lib',
        ['name', libName],
        ['type', 'KiCad'],
        ['uri', libPath],
        ['options', ''],
        ['descr', 'Added by PartKit plugin']
      ];
      
      tree.push(libNode);
      const serializedTable = serializeSExpr(tree);
      fs.writeFileSync(tablePath, serializedTable, 'utf8');
      logMessage('SUCCESS', `Registered "${libName}" library in global ${tableFile}!`);
    }
  } catch (e) {
    logMessage('WARN', `Error registering library in table ${tableFile}: ${e.message}`);
  }
}

// Serve front-end assets in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*any', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`PartKit backend server running on http://localhost:${PORT}`);
});
