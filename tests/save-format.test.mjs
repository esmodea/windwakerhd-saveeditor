import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAVE_SIZE,
  applySlotEdits,
  cloneBytes,
  readSave,
  repairAllChecksums,
  validateSlotChecksum,
} from "../site/save-format.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixturePath = process.env.WWHD_FIXTURE;

function blankSave() {
  const bytes = new Uint8Array(SAVE_SIZE);
  for (let slot = 0; slot < 3; slot += 1) {
    const base = slot * 0xA94;
    bytes.fill(0xFF, base + 0x09, base + 0x12);
    bytes.fill(0xFF, base + 0x3C, base + 0x51);
  }
  const names = ["ONE", "TWO", "THREE"];
  for (let slot = 0; slot < 3; slot += 1) {
    applySlotEdits(bytes, slot, {
      displayName: names[slot],
      maxHearts: 3,
      currentHearts: 3,
      rupees: 0,
      walletLevel: 0,
      maxMagic: 0,
      currentMagic: 0,
      arrows: 0,
      maxArrows: 0,
      bombs: 0,
      maxBombs: 0,
    });
  }
  return bytes;
}

test("reads and edits a synthetic save", () => {
  const bytes = blankSave();
  const edited = cloneBytes(bytes);
  applySlotEdits(edited, 0, {
    displayName: "Hero",
    maxHearts: 11.75,
    currentHearts: 8.5,
    rupees: 1172,
    walletLevel: 2,
    maxMagic: 32,
    currentMagic: 1,
    arrows: 97,
    maxArrows: 99,
    bombs: 99,
    maxBombs: 99,
    inventory: { sail: 0x77, pictobox: 0x23, bottle1: 0x55, bottle2: 0x57 },
    equipment: { sword: 0x3E, shield: 0x3C, bracelets: 0x28 },
  });
  const slot = readSave(edited)[0];
  assert.equal(slot.displayName, "Hero");
  assert.deepEqual(slot.internalNames, ["Hero", "Hero", "Hero"]);
  assert.equal(slot.maxHearts, 11.75);
  assert.equal(slot.currentHearts, 8.5);
  assert.equal(slot.rupees, 1172);
  assert.equal(slot.inventory.sail, 0x77);
  assert.equal(slot.equipment.sword, 0x3E);
  assert.equal(validateSlotChecksum(edited, 0), true);
});

test("normalizes dependent values", () => {
  const bytes = blankSave();
  applySlotEdits(bytes, 1, {
    maxHearts: 3,
    currentHearts: 10,
    walletLevel: 0,
    rupees: 5000,
    maxMagic: 16,
    currentMagic: 32,
    maxArrows: 30,
    arrows: 99,
    maxBombs: 30,
    bombs: 99,
  });
  const slot = readSave(bytes)[1];
  assert.equal(slot.currentHearts, 3);
  assert.equal(slot.rupees, 200);
  assert.equal(slot.currentMagic, 16);
  assert.equal(slot.arrows, 30);
  assert.equal(slot.bombs, 30);
});


test("preserves unknown fixed-slot values while editing another field", () => {
  const bytes = blankSave();
  const base = 0;
  bytes[base + 0x3C] = 0xAA;
  repairAllChecksums(bytes);
  applySlotEdits(bytes, 0, {
    rupees: 25,
    inventory: { telescope: 0xAA },
  });
  assert.equal(bytes[base + 0x3C], 0xAA);
  assert.equal(readSave(bytes)[0].rupees, 25);
  assert.equal(validateSlotChecksum(bytes, 0), true);
});

test("rejects the wrong file size", () => {
  assert.throws(() => readSave(new Uint8Array(10)), /Expected cking\.sav/);
});

if (fixturePath) {
  test("round-trips the supplied real save fixture without modifying fields", async () => {
    const original = new Uint8Array(await readFile(fixturePath));
    assert.equal(original.length, SAVE_SIZE);
    const copy = cloneBytes(original);
    repairAllChecksums(copy);
    for (let slot = 0; slot < 3; slot += 1) assert.equal(validateSlotChecksum(copy, slot), true);
    const parsed = readSave(copy);
    assert.equal(parsed.length, 3);
    assert.ok(parsed[0].displayName.length > 0);
  });
}
