// test_parser.js
import { parseSExpr, serializeSExpr, parseSymbolTree, parseFootprintTree, validateComponent } from './parser.js';
import fs from 'fs';

// 1. Mock S-expression symbol content
const mockSymbolSexpr = `(kicad_symbol_lib
  (version 20211014)
  (generator kicad_symbol_editor)
  (symbol "STM32F103_Old" (pin input line (at -5.08 2.54 0) (length 2.54)
    (name "PA0" (effects (font (size 1.27 1.27))))
    (number "1" (effects (font (size 1.27 1.27))))
  )
  (pin bidirectional line (at 5.08 2.54 180) (length 2.54)
    (name "PA1" (effects (font (size 1.27 1.27))))
    (number "2" (effects (font (size 1.27 1.27))))
  ))
)`;

// 2. Mock S-expression footprint content
const mockFootprintSexpr = `(footprint "LQFP-48_Old" (version 20211014) (generator pcbnew)
  (pad "1" smd rect (at -3 0 90) (size 0.5 1.5) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at -3 0.5 90) (size 0.5 1.5) (layers "F.Cu" "F.Paste" "F.Mask"))
  (model "shapes/old_model.step"
    (at (xyz 0 0 0))
    (scale (xyz 1 1 1))
    (rotate (xyz 0 0 0))
  )
)`;

function runTests() {
  console.log("=== Running PartKit Parser Integration Tests ===");

  // --- Test 1: S-Expression Parser Basic Roundtrip ---
  console.log("\n[Test 1] Testing S-Expression parser parsing...");
  const parsedSym = parseSExpr(mockSymbolSexpr);
  if (!parsedSym || parsedSym[0] !== 'kicad_symbol_lib') {
    console.error("FAIL: Expected root to be 'kicad_symbol_lib', got:", parsedSym?.[0]);
    process.exit(1);
  }
  console.log("PASS: Successfully parsed symbol S-expression.");

  const serializedSym = serializeSExpr(parsedSym);
  console.log("PASS: Successfully serialized symbol back to string.");
  
  // Verify structure is preserved (we parse the serialized output again)
  const parsedAgainSym = parseSExpr(serializedSym);
  if (parsedAgainSym[1][1] !== 20211014) {
    console.error("FAIL: Expected version 20211014 after round-trip, got:", parsedAgainSym[1][1]);
    process.exit(1);
  }
  console.log("PASS: Roundtrip parsed matches expectations.");

  // --- Test 2: Symbol Tree Metadata Extraction ---
  console.log("\n[Test 2] Testing Symbol metadata extraction...");
  const extractedSymbol = parseSymbolTree(parsedSym);
  if (!extractedSymbol || extractedSymbol.symbols.length === 0) {
    console.error("FAIL: Could not extract symbols metadata.");
    process.exit(1);
  }
  const symData = extractedSymbol.symbols[0];
  if (symData.name !== 'STM32F103_Old') {
    console.error("FAIL: Expected symbol name 'STM32F103_Old', got:", symData.name);
    process.exit(1);
  }
  if (symData.pins.length !== 2) {
    console.error("FAIL: Expected 2 pins, got:", symData.pins.length);
    process.exit(1);
  }
  const pin1 = symData.pins[0];
  if (pin1.number !== '1' || pin1.name !== 'PA0' || pin1.x !== -5.08 || pin1.y !== -2.54) {
    console.error("FAIL: Pin 1 data mismatch:", pin1);
    process.exit(1);
  }
  console.log("PASS: Symbol metadata extraction details match mock file perfectly.");

  // --- Test 3: Footprint Tree Metadata Extraction ---
  console.log("\n[Test 3] Testing Footprint metadata extraction...");
  const parsedFp = parseSExpr(mockFootprintSexpr);
  const extractedFp = parseFootprintTree(parsedFp);
  if (!extractedFp || extractedFp.name !== 'LQFP-48_Old') {
    console.error("FAIL: Expected footprint name 'LQFP-48_Old', got:", extractedFp?.name);
    process.exit(1);
  }
  if (extractedFp.pads.length !== 2) {
    console.error("FAIL: Expected 2 pads, got:", extractedFp.pads.length);
    process.exit(1);
  }
  const pad2 = extractedFp.pads[1];
  if (pad2.number !== '2' || pad2.x !== -3 || pad2.y !== 0.5 || pad2.angle !== 90) {
    console.error("FAIL: Pad 2 data mismatch:", pad2);
    process.exit(1);
  }
  if (extractedFp.model.path !== 'shapes/old_model.step') {
    console.error("FAIL: Expected model path 'shapes/old_model.step', got:", extractedFp.model.path);
    process.exit(1);
  }
  console.log("PASS: Footprint metadata extraction details match mock file perfectly.");

  // --- Test 4: Modifying Symbol and Footprint ---
  console.log("\n[Test 4] Testing S-expression modification (Renaming / 3D offsets)...");
  
  // Rename symbol in tree
  const symBlock = parsedSym.find(c => Array.isArray(c) && c[0] === 'symbol');
  symBlock[1] = "STM32F103_New";
  
  const serializedRenamedSym = serializeSExpr(parsedSym);
  if (!serializedRenamedSym.includes('symbol "STM32F103_New"')) {
    console.error("FAIL: Serialized output does not contain renamed symbol tag.");
    process.exit(1);
  }
  console.log("PASS: Renamed symbol matches correctly.");

  // Rename footprint & update 3D model properties in tree
  parsedFp[1] = "LQFP-48_New";
  const modelNode = parsedFp.find(c => Array.isArray(c) && c[0] === 'model');
  modelNode[1] = "shapes/new_model.step";
  
  // Set offset (at (xyz 1.5 -2.0 4.2))
  const atNode = modelNode.find(c => Array.isArray(c) && c[0] === 'at');
  atNode[1] = ['xyz', 1.5, -2.0, 4.2];
  
  const serializedRenamedFp = serializeSExpr(parsedFp);
  if (!serializedRenamedFp.includes('footprint "LQFP-48_New"')) {
    console.error("FAIL: Serialized output does not contain renamed footprint tag.");
    process.exit(1);
  }
  if (!serializedRenamedFp.includes('model "shapes/new_model.step"')) {
    console.error("FAIL: Serialized output does not contain updated step path.");
    process.exit(1);
  }
  if (!serializedRenamedFp.includes('(xyz 1.5 -2 4.2)')) {
    console.error("FAIL: Serialized output does not contain updated xyz offsets, got:", serializedRenamedFp);
    process.exit(1);
  }
  console.log("PASS: Footprint name, 3D path, and offset modifications round-tripped perfectly.");

  // --- Test 5: Validation Checking Engine ---
  console.log("\n[Test 5] Testing Validation checking engine...");
  
  // Test case A: Clean pass
  const valResult1 = validateComponent(extractedSymbol, extractedFp, null, null, "TEST_PART");
  if (!valResult1.valid) {
    console.error("FAIL: Expected clean validation to be valid, errors:", valResult1.errors);
    process.exit(1);
  }
  console.log("PASS: Clean validation passed successfully.");

  // Test case B: Invalid part name
  const valResult2 = validateComponent(extractedSymbol, extractedFp, null, null, "TEST PART SPACE");
  if (valResult2.valid || valResult2.errors.length === 0) {
    console.error("FAIL: Validation engine failed to block invalid symbol characters.");
    process.exit(1);
  }
  console.log("PASS: Validation engine successfully blocked invalid part names.");

  // Test case C: Mismatched Pins vs Pads warning
  const modifiedSymbol = JSON.parse(JSON.stringify(extractedSymbol));
  modifiedSymbol.symbols[0].pins.push({
    number: "9", // Pad 9 does not exist in footprint
    name: "MISMATCH_PIN",
    x: 0, y: 0, angle: 0
  });

  const valResult3 = validateComponent(modifiedSymbol, extractedFp, null, null, "TEST_PART");
  const pinWarning = valResult3.warnings.find(w => w.includes("missing from the footprint"));
  if (!pinWarning) {
    console.error("FAIL: Validation engine failed to catch pin-pad mapping warning. Warnings:", valResult3.warnings);
    process.exit(1);
  }
  console.log("PASS: Validation engine successfully generated pin-to-pad mismatch warnings.");

  console.log("\n================================================");
  console.log("SUCCESS: All integration tests passed cleanly!");
  console.log("================================================");
}

runTests();
