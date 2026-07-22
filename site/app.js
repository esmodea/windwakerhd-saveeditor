import {
  EQUIPMENT,
  INVENTORY,
  SAVE_SIZE,
  applySlotEdits,
  cloneBytes,
  diffSave,
  readSave,
  repairAllChecksums,
  walletCapacity,
} from "./save-format.js";

const state = {
  original: null,
  working: null,
  filename: "cking.sav",
  selectedSlot: 0,
};

const els = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  emptyState: document.querySelector("#empty-state"),
  editor: document.querySelector("#editor"),
  slotTabs: document.querySelector("#slot-tabs"),
  slotSummary: document.querySelector("#slot-summary"),
  form: document.querySelector("#slot-form"),
  inventoryGrid: document.querySelector("#inventory-grid"),
  equipmentGrid: document.querySelector("#equipment-grid"),
  changeList: document.querySelector("#change-list"),
  status: document.querySelector("#status"),
  download: document.querySelector("#download-save"),
  resetSlot: document.querySelector("#reset-slot"),
  resetAll: document.querySelector("#reset-all"),
  repair: document.querySelector("#repair-checksums"),
  fileDetails: document.querySelector("#file-details"),
};

buildSelectControls();

els.fileInput.addEventListener("change", () => {
  const [file] = els.fileInput.files;
  if (file) loadFile(file);
});

for (const eventName of ["dragenter", "dragover"]) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragging");
  });
}
els.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) loadFile(file);
});

els.form.addEventListener("change", applyForm);
els.form.addEventListener("input", (event) => {
  if (event.target.matches('input[type="text"], input[type="number"]')) applyForm();
});

els.download.addEventListener("click", downloadSave);
els.resetSlot.addEventListener("click", resetSelectedSlot);
els.resetAll.addEventListener("click", resetAll);
els.repair.addEventListener("click", () => {
  if (!state.working) return;
  repairAllChecksums(state.working);
  setStatus("All three quest-log checksums were recalculated.", "success");
  render();
});

async function loadFile(file) {
  clearStatus();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== SAVE_SIZE) {
      throw new Error(`This editor expects the raw cking.sav file (${SAVE_SIZE} bytes / 0x${SAVE_SIZE.toString(16).toUpperCase()}). ZIP archives and pictograph files are intentionally not accepted.`);
    }
    state.original = bytes;
    state.working = cloneBytes(bytes);
    state.filename = file.name || "cking.sav";
    state.selectedSlot = 0;
    els.emptyState.hidden = true;
    els.editor.hidden = false;
    setStatus("Save loaded locally. Nothing has been uploaded.", "success");
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.fileInput.value = "";
  }
}

function render() {
  if (!state.working) return;
  const slots = readSave(state.working);
  const slot = slots[state.selectedSlot];
  els.fileDetails.textContent = `${state.filename} · ${state.working.length.toLocaleString()} bytes`;

  els.slotTabs.replaceChildren(...slots.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot-tab${index === state.selectedSlot ? " is-active" : ""}`;
    button.innerHTML = `<span>Quest Log ${index + 1}</span><strong>${escapeHtml(item.displayName || "Empty")}</strong><small class="${item.checksumValid ? "valid" : "invalid"}">${item.checksumValid ? "Checksum valid" : "Checksum needs repair"}</small>`;
    button.addEventListener("click", () => {
      state.selectedSlot = index;
      render();
    });
    return button;
  }));

  els.slotSummary.innerHTML = `
    <div><span>Max health</span><strong>${formatHearts(slot.maxHearts)}</strong></div>
    <div><span>Rupees</span><strong>${slot.rupees.toLocaleString()} / ${slot.walletCapacity.toLocaleString()}</strong></div>
    <div><span>Magic</span><strong>${slot.currentMagic} / ${slot.maxMagic}</strong></div>
    <div><span>Ammo</span><strong>${slot.arrows} arrows · ${slot.bombs} bombs</strong></div>
  `;

  setInput("displayName", slot.displayName);
  setInput("maxHearts", slot.maxHearts);
  setInput("currentHearts", slot.currentHearts);
  setInput("rupees", slot.rupees);
  setInput("walletLevel", slot.walletLevel);
  setInput("maxMagic", slot.maxMagic);
  setInput("currentMagic", slot.currentMagic);
  setInput("arrows", slot.arrows);
  setInput("maxArrows", slot.maxArrows);
  setInput("bombs", slot.bombs);
  setInput("maxBombs", slot.maxBombs);

  for (const [key] of Object.entries(INVENTORY)) setInput(`inventory.${key}`, slot.inventory[key]);
  for (const [key] of Object.entries(EQUIPMENT)) setInput(`equipment.${key}`, slot.equipment[key]);

  renderChanges();
}

function applyForm() {
  if (!state.working) return;
  try {
    const formData = new FormData(els.form);
    const edits = {
      displayName: formData.get("displayName"),
      maxHearts: Number(formData.get("maxHearts")),
      currentHearts: Number(formData.get("currentHearts")),
      rupees: Number(formData.get("rupees")),
      walletLevel: Number(formData.get("walletLevel")),
      maxMagic: Number(formData.get("maxMagic")),
      currentMagic: Number(formData.get("currentMagic")),
      arrows: Number(formData.get("arrows")),
      maxArrows: Number(formData.get("maxArrows")),
      bombs: Number(formData.get("bombs")),
      maxBombs: Number(formData.get("maxBombs")),
      inventory: Object.fromEntries(Object.keys(INVENTORY).map((key) => [key, Number(formData.get(`inventory.${key}`))])),
      equipment: Object.fromEntries(Object.keys(EQUIPMENT).map((key) => [key, Number(formData.get(`equipment.${key}`))])),
    };

    const capacity = walletCapacity(edits.walletLevel);
    if (edits.rupees > capacity) edits.rupees = capacity;
    if (edits.currentHearts > edits.maxHearts) edits.currentHearts = edits.maxHearts;
    if (edits.currentMagic > edits.maxMagic) edits.currentMagic = edits.maxMagic;
    if (edits.arrows > edits.maxArrows) edits.arrows = edits.maxArrows;
    if (edits.bombs > edits.maxBombs) edits.bombs = edits.maxBombs;

    applySlotEdits(state.working, state.selectedSlot, edits);
    clearStatus();
    render();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function renderChanges() {
  const groups = diffSave(state.original, state.working);
  const hasRawChanges = state.original.some((value, index) => value !== state.working[index]);
  els.download.disabled = !hasRawChanges;
  if (!groups.length) {
    els.changeList.innerHTML = hasRawChanges
      ? '<p class="muted">Only checksum bytes have changed.</p>'
      : '<p class="muted">No changes yet.</p>';
    return;
  }
  els.changeList.replaceChildren(...groups.map((group) => {
    const section = document.createElement("section");
    section.className = "change-group";
    section.innerHTML = `<h4>Quest Log ${group.slotIndex + 1}: ${escapeHtml(group.name)}</h4>`;
    const list = document.createElement("ul");
    for (const change of group.changes) {
      const item = document.createElement("li");
      item.innerHTML = `<span>${escapeHtml(change.label)}</span><code>${escapeHtml(String(change.before))}</code><b>→</b><code>${escapeHtml(String(change.after))}</code>`;
      list.append(item);
    }
    section.append(list);
    return section;
  }));
}

function downloadSave() {
  if (!state.working) return;
  try {
    repairAllChecksums(state.working);
    const blob = new Blob([state.working], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stem = state.filename.toLowerCase().endsWith(".sav") ? state.filename.slice(0, -4) : state.filename;
    anchor.href = url;
    anchor.download = `${stem}-modified.sav`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Modified save downloaded. Keep your original backup until the edited file has loaded successfully in-game.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function resetSelectedSlot() {
  if (!state.original || !state.working) return;
  const start = state.selectedSlot * 0xA94;
  state.working.set(state.original.slice(start, start + 0xA94), start);
  const nameOffsets = [0x2035, 0x2047, 0x2059];
  const nameOffset = nameOffsets[state.selectedSlot];
  state.working.set(state.original.slice(nameOffset, nameOffset + 18), nameOffset);
  setStatus(`Quest Log ${state.selectedSlot + 1} was restored from the loaded backup.`, "success");
  render();
}

function resetAll() {
  if (!state.original) return;
  state.working = cloneBytes(state.original);
  setStatus("All edits were discarded.", "success");
  render();
}

function buildSelectControls() {
  els.inventoryGrid.replaceChildren(...Object.entries(INVENTORY).map(([key, field]) => selectField(`inventory.${key}`, field.label, field.values)));
  els.equipmentGrid.replaceChildren(...Object.entries(EQUIPMENT).map(([key, field]) => selectField(`equipment.${key}`, field.label, field.values)));
}

function selectField(name, label, values) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.innerHTML = `<span>${escapeHtml(label)}</span>`;
  const select = document.createElement("select");
  select.name = name;
  for (const [value, text] of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  wrapper.append(select);
  return wrapper;
}

function setInput(name, value) {
  const input = els.form.elements.namedItem(name);
  if (!input) return;
  if (input instanceof HTMLSelectElement) {
    for (const option of [...input.querySelectorAll('option[data-unknown="true"]')]) option.remove();
    const target = String(value);
    if (![...input.options].some((option) => option.value === target)) {
      const option = document.createElement("option");
      option.value = target;
      option.dataset.unknown = "true";
      option.textContent = `Keep unknown value 0x${Number(value).toString(16).toUpperCase().padStart(2, "0")}`;
      input.append(option);
    }
  }
  input.value = value;
}

function setStatus(message, type) {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
  els.status.hidden = false;
}

function clearStatus() {
  els.status.hidden = true;
  els.status.textContent = "";
}

function formatHearts(value) {
  return Number.isInteger(value) ? `${value} hearts` : `${value.toFixed(2).replace(/0$/, "")} hearts`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
