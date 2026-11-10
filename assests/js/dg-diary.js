(() => {
  "use strict";

  window.CalmNestDG = window.CalmNestDG || {};

  const Storage = window.CalmNestDG.Storage;
  const StickerLibrary = window.CalmNestDG.Stickers;

  if (!Storage) {
    console.error("CalmNestDG.Storage is not loaded.");
    return;
  }

  const Diary = {
    initialized: false,
    editingId: null,
    selectedStickers: [],
    activeStickerId: null,
    activeCategory: "flowers",
    dragState: null,
    stickerCounter: 0,
    elements: {},

    init() {
      if (this.initialized) return;

      const ids = [
        "dgForm", "dgDate", "dgTitle", "dgText", "dgCount",
        "dgPaper", "dgStickerLayer", "dgMoods", "dgEditing",
        "dgCancel", "dgSave", "dgNew", "dgFormErr",
        "dgStickerTabs", "dgStickerGrid", "dgStickerTools",
        "dgStSmaller", "dgStLarger", "dgStRotate", "dgStRemove"
      ];

      ids.forEach((id) => {
        this.elements[id] = document.getElementById(id);
      });

      const el = this.elements;

      if (!el.dgForm) {
        console.warn("Diary form #dgForm was not found.");
        return;
      }

      Storage.init();

      this.bindEvents();
      this.setToday();
      this.updateCount();
      this.renderStickerPicker(this.activeCategory);
      this.updateStickerTools();

      this.initialized = true;
    },

    bindEvents() {
      const el = this.elements;

      el.dgForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.saveEntry();
      });

      el.dgText.addEventListener("input", () => {
        this.updateCount();
        this.clearError();
      });

      el.dgTitle.addEventListener("input", () => this.clearError());
      el.dgDate.addEventListener("change", () => this.clearError());

      el.dgCancel.addEventListener("click", () => this.cancelEdit());
      el.dgNew.addEventListener("click", () => this.reset());

      el.dgMoods.addEventListener("change", () => this.clearError());

      // Sticker category buttons
      if (el.dgStickerTabs) {
        el.dgStickerTabs.addEventListener("click", (event) => {
          const button = event.target.closest("[data-cat]");
          if (!button) return;

          this.activeCategory = button.dataset.cat;
          this.updateCategoryButtons();
          this.renderStickerPicker(this.activeCategory);
        });
      }

      // Sticker option buttons
      if (el.dgStickerGrid) {
        el.dgStickerGrid.addEventListener("click", (event) => {
          const button = event.target.closest("[data-sticker-type]");
          if (!button) return;

          this.addSticker(button.dataset.stickerType);
        });
      }

      // Sticker tools
      el.dgStSmaller?.addEventListener("click", () => {
        this.resizeActiveSticker(-10);
      });

      el.dgStLarger?.addEventListener("click", () => {
        this.resizeActiveSticker(10);
      });

      el.dgStRotate?.addEventListener("click", () => {
        this.rotateActiveSticker(15);
      });

      el.dgStRemove?.addEventListener("click", () => {
        this.removeActiveSticker();
      });

      // Select and drag stickers on the diary page
      if (el.dgStickerLayer) {
        el.dgStickerLayer.addEventListener("pointerdown", (event) => {
          const stickerElement = event.target.closest("[data-sticker-id]");
          if (!stickerElement) return;

          event.preventDefault();

          const stickerId = stickerElement.dataset.stickerId;
          this.selectSticker(stickerId);

          const sticker = this.selectedStickers.find(
            (item) => item.id === stickerId
          );

          if (!sticker) return;

          this.dragState = {
            id: stickerId,
            startX: event.clientX,
            startY: event.clientY,
            originalX: sticker.x,
            originalY: sticker.y
          };

          stickerElement.setPointerCapture?.(event.pointerId);
        });

        el.dgStickerLayer.addEventListener("pointermove", (event) => {
          if (!this.dragState) return;

          const layer = el.dgStickerLayer;
          const rect = layer.getBoundingClientRect();

          if (!rect.width || !rect.height) return;

          const dx =
            ((event.clientX - this.dragState.startX) / rect.width) * 100;

          const dy =
            ((event.clientY - this.dragState.startY) / rect.height) * 100;

          const sticker = this.selectedStickers.find(
            (item) => item.id === this.dragState.id
          );

          if (!sticker) return;

          sticker.x = this.clamp(
            this.dragState.originalX + dx,
            0,
            100
          );

          sticker.y = this.clamp(
            this.dragState.originalY + dy,
            0,
            100
          );

          this.renderStickers();
        });

        const stopDragging = () => {
          this.dragState = null;
        };

        el.dgStickerLayer.addEventListener("pointerup", stopDragging);
        el.dgStickerLayer.addEventListener("pointercancel", stopDragging);
      }

      // Delete selected sticker with Delete/Backspace
      document.addEventListener("keydown", (event) => {
        if (!this.activeStickerId) return;

        const tag = document.activeElement?.tagName;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          this.removeActiveSticker();
        }
      });
    },

    setToday() {
      this.elements.dgDate.value = Storage.todayISO();
    },

    getSelectedMood() {
      const selected = this.elements.dgForm.querySelector(
        'input[name="mood"]:checked'
      );

      return selected ? selected.value : "calm";
    },

    setMood(mood) {
      const radio = this.elements.dgForm.querySelector(
        `input[name="mood"][value="${mood}"]`
      );

      if (radio) radio.checked = true;
    },

    updateCount() {
      const length = this.elements.dgText.value.length;

      this.elements.dgCount.textContent = `${length} / 2000`;

      this.elements.dgCount.classList.toggle(
        "is-near-limit",
        length >= 1800
      );

      this.elements.dgCount.classList.toggle(
        "is-at-limit",
        length >= 2000
      );
    },

    showError(message) {
      this.elements.dgFormErr.textContent = message;
      this.elements.dgFormErr.hidden = false;
    },

    clearError() {
      this.elements.dgFormErr.textContent = "";
      this.elements.dgFormErr.hidden = true;
    },

    getFormData() {
      return {
        date: this.elements.dgDate.value,
        title: this.elements.dgTitle.value.trim(),
        mood: this.getSelectedMood(),
        text: this.elements.dgText.value.trim(),
        stickers: this.selectedStickers.map((sticker) => ({
          type: sticker.type,
          x: sticker.x,
          y: sticker.y,
          size: sticker.size,
          rot: sticker.rot
        }))
      };
    },

    saveEntry() {
      this.clearError();

      const data = this.getFormData();

      if (!data.date) {
        this.showError("Please select a date for your page.");
        this.elements.dgDate.focus();
        return;
      }

      if (!data.text) {
        this.showError("Write a little thought before saving your page.");
        this.elements.dgText.focus();
        return;
      }

      const wasEditing = Boolean(this.editingId);
      let result;

      if (wasEditing) {
        result = Storage.updateEntry(this.editingId, data);
      } else {
        result = Storage.createEntry(data);
      }

      if (!result || !result.ok) {
        this.showError(
          result?.message || "Your page could not be saved. Please try again."
        );
        return;
      }

      const savedEntry = result.entry || result;

      this.reset();

      document.dispatchEvent(
        new CustomEvent("calmnest:diary-saved", {
          detail: {
            entry: savedEntry,
            updated: wasEditing
          }
        })
      );

      this.showToast(
        wasEditing
          ? "Your thought has been updated 🌱"
          : "Your thought has been planted 🌱"
      );
    },

    loadEntry(entryOrId) {
      const entry =
        typeof entryOrId === "string"
          ? Storage.getEntry(entryOrId)
          : entryOrId;

      if (!entry) {
        this.showError("This saved page could not be found.");
        return;
      }

      this.editingId = entry.id;

      this.elements.dgDate.value = entry.date || Storage.todayISO();
      this.elements.dgTitle.value = entry.title || "";
      this.elements.dgText.value = entry.text || "";

      this.setMood(entry.mood || "calm");
      this.updateCount();
      this.clearError();

      this.elements.dgEditing.hidden = false;
      this.elements.dgSave.textContent = "✎ Update my page";

      this.selectedStickers = (entry.stickers || []).map((sticker) => ({
        id: this.createStickerId(),
        type: sticker.type,
        x: Number(sticker.x ?? 50),
        y: Number(sticker.y ?? 50),
        size: Number(sticker.size ?? 64),
        rot: Number(sticker.rot ?? 0)
      }));

      this.activeStickerId = null;
      this.renderStickers();
      this.updateStickerTools();

      this.elements.dgForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      this.elements.dgText.focus();
    },

    cancelEdit() {
      this.reset();

      document.dispatchEvent(
        new CustomEvent("calmnest:diary-edit-cancelled")
      );
    },

    reset() {
      this.editingId = null;
      this.selectedStickers = [];
      this.activeStickerId = null;
      this.dragState = null;

      this.elements.dgForm.reset();
      this.setToday();
      this.setMood("calm");

      this.elements.dgEditing.hidden = true;
      this.elements.dgSave.textContent = "🌱 Save to my garden";

      this.renderStickers();
      this.updateStickerTools();
      this.updateCount();
      this.clearError();
    },

    // ---------- Sticker picker ----------

    getStickerList(category) {
      if (!StickerLibrary) return [];

      let stickers = [];

      if (category === "all" && typeof StickerLibrary.list === "function") {
        stickers = StickerLibrary.list();
      } else if (typeof StickerLibrary.byCategory === "function") {
        stickers = StickerLibrary.byCategory(category);
      }

      return Array.isArray(stickers) ? stickers : [];
    },

    getStickerType(sticker) {
      if (typeof sticker === "string") return sticker;

      return sticker?.type || sticker?.id || sticker?.key || "";
    },

    renderStickerPicker(category) {
      const grid = this.elements.dgStickerGrid;
      if (!grid || !StickerLibrary) return;

      grid.replaceChildren();

      const stickers = this.getStickerList(category);

      stickers.forEach((sticker) => {
        const type = this.getStickerType(sticker);

        if (!type || !StickerLibrary.isValidType(type)) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "dg-sticker-option";
        button.dataset.stickerType = type;
        button.setAttribute("aria-label", `Add ${type} sticker`);
        button.title = `Add ${type}`;

        const graphic = StickerLibrary.element(type);

        if (graphic) {
          graphic.classList.add("dg-sticker-preview");
          graphic.setAttribute("aria-hidden", "true");
          button.appendChild(graphic);
        } else {
          button.textContent = "🌸";
        }

        grid.appendChild(button);
      });

      if (!grid.children.length) {
        const message = document.createElement("span");
        message.className = "dg-hint";
        message.textContent = "No stickers found in this category.";
        grid.appendChild(message);
      }
    },

    updateCategoryButtons() {
      const tabs = this.elements.dgStickerTabs;
      if (!tabs) return;

      tabs.querySelectorAll("[data-cat]").forEach((button) => {
        const active = button.dataset.cat === this.activeCategory;

        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("active", active);
      });
    },

    // ---------- Sticker placement and selection ----------

    createStickerId() {
      this.stickerCounter += 1;

      return `dg-sticker-${Date.now()}-${this.stickerCounter}`;
    },

   addSticker(type) {
  if (!StickerLibrary || !StickerLibrary.isValidType(type)) return;

  if (this.selectedStickers.length >= 30) {
    this.showToast("You can add up to 30 stickers on one page.");
    return;
  }

  const sticker = {
    id: this.createStickerId(),
    type,
    x: 15 + Math.random() * 70,
    y: 15 + Math.random() * 70,
    size: 64,
    rot: 0
  };

  this.selectedStickers.push(sticker);
  this.activeStickerId = sticker.id;

  this.renderStickers();
  this.updateStickerTools();
},

    selectSticker(id) {
      this.activeStickerId = id;

      this.elements.dgStickerLayer
        ?.querySelectorAll("[data-sticker-id]")
        .forEach((element) => {
          element.classList.toggle(
            "is-selected",
            element.dataset.stickerId === id
          );
        });

      this.updateStickerTools();
    },

    renderStickers() {
      const layer = this.elements.dgStickerLayer;
      if (!layer) return;

      layer.replaceChildren();

      if (!StickerLibrary) return;

      this.selectedStickers.forEach((sticker) => {
        if (!StickerLibrary.isValidType(sticker.type)) return;

        const item = StickerLibrary.element(sticker.type);
        if (!item) return;

        item.classList.add("dg-sticker");
        item.dataset.stickerId = sticker.id;
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-label", "Select and move sticker");

        item.style.position = "absolute";
        item.style.left = `${sticker.x}%`;
        item.style.top = `${sticker.y}%`;
        item.style.width = `${sticker.size}px`;
        item.style.height = `${sticker.size}px`;
        item.style.cursor = "grab";
        item.style.touchAction = "none";
        item.style.transform =
          `translate(-50%, -50%) rotate(${sticker.rot}deg)`;

        item.classList.toggle(
          "is-selected",
          sticker.id === this.activeStickerId
        );

        layer.appendChild(item);
      });
    },

    updateStickerTools() {
      const tools = this.elements.dgStickerTools;
      if (!tools) return;

      const hasSelection = this.selectedStickers.some(
        (sticker) => sticker.id === this.activeStickerId
      );

      tools.hidden = !hasSelection;
    },

    getActiveSticker() {
      return this.selectedStickers.find(
        (sticker) => sticker.id === this.activeStickerId
      );
    },

    resizeActiveSticker(amount) {
      const sticker = this.getActiveSticker();
      if (!sticker) return;

      sticker.size = this.clamp(sticker.size + amount, 28, 160);
      this.renderStickers();
      this.updateStickerTools();
    },

    rotateActiveSticker(amount) {
      const sticker = this.getActiveSticker();
      if (!sticker) return;

      sticker.rot = (sticker.rot + amount) % 360;
      this.renderStickers();
    },

    removeActiveSticker() {
      if (!this.activeStickerId) return;

      this.selectedStickers = this.selectedStickers.filter(
        (sticker) => sticker.id !== this.activeStickerId
      );

      this.activeStickerId = null;

      this.renderStickers();
      this.updateStickerTools();
    },

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    showToast(message) {
      const toast = document.getElementById("dgToast");
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add("show");

      window.setTimeout(() => {
        toast.classList.remove("show");
      }, 2800);
    }
  };

  window.CalmNestDG.Diary = Diary;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Diary.init(), {
      once: true
    });
  } else {
    Diary.init();
  }
})();