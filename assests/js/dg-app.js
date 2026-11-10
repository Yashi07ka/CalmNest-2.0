(() => {
  "use strict";

  window.CalmNestDG = window.CalmNestDG || {};

  const Storage = window.CalmNestDG.Storage;
  const Diary = window.CalmNestDG.Diary;
  const Garden = window.CalmNestDG.Garden;
  const Collections = window.CalmNestDG.Collections;

  if (!Storage) {
    console.error("CalmNestDG.Storage is not loaded.");
    return;
  }

  const App = {
    initialized: false,
    deleteEntryId: null,
    importPayload: null,

    elements: {},

    init() {
      if (this.initialized) return;

      this.elements = {
        search: document.getElementById("dgSearch"),
        sort: document.getElementById("dgSort"),
        entries: document.getElementById("dgEntries"),
        empty: document.getElementById("dgEntriesEmpty"),
        savedColl: document.getElementById("dgSavedColl"),

        export: document.getElementById("dgExport"),
        importButton: document.getElementById("dgImportBtn"),
        importFile: document.getElementById("dgImportFile"),

        importDialog: document.getElementById("dgImportDlg"),
        importSummary: document.getElementById("dgImportSummary"),
        importCancel: document.getElementById("dgImportCancel"),
        importOk: document.getElementById("dgImportOk"),

        confirmDialog: document.getElementById("dgConfirmDlg"),
        confirmText: document.getElementById("dgConfirmText"),
        confirmCancel: document.getElementById("dgConfirmCancel"),
        confirmOk: document.getElementById("dgConfirmOk")
      };

      this.bindEvents();

      Storage.init();

      if (Diary) Diary.init();
      if (Garden) Garden.init();
      if (Collections) Collections.init();

      Storage.subscribe(() => {
        this.renderEntries();
      });

      document.addEventListener("calmnest:collection-changed", () => {
        this.renderEntries();
      });

      document.addEventListener("calmnest:diary-saved", () => {
        this.renderEntries();
      });

      this.renderEntries();
      this.showStorageWarnings();

      this.initialized = true;
    },

    bindEvents() {
      const el = this.elements;

      el.search.addEventListener("input", () => {
        this.renderEntries();
      });

      el.sort.addEventListener("change", () => {
        this.renderEntries();
      });

      el.export.addEventListener("click", () => {
        const result = Storage.downloadBackup();

        if (!result || !result.ok) {
          this.showToast(
            result && result.message
              ? result.message
              : "Backup could not be downloaded."
          );
          return;
        }

        this.showToast("Garden backup downloaded 🌱");
      });

      el.importButton.addEventListener("click", () => {
        el.importFile.click();
      });

      el.importFile.addEventListener("change", () => {
        this.readImportFile();
      });

      el.importCancel.addEventListener("click", () => {
        el.importDialog.close();
        this.importPayload = null;
      });

      el.importOk.addEventListener("click", () => {
        this.applyImport();
      });

      el.confirmCancel.addEventListener("click", () => {
        el.confirmDialog.close();
        this.deleteEntryId = null;
      });

      el.confirmOk.addEventListener("click", () => {
        this.deleteEntry();
      });
    },

    getActiveCollectionId() {
      return Collections
        ? Collections.activeId || Storage.ALL_ID
        : Storage.ALL_ID;
    },

    getActiveCollectionName() {
      const collection = Storage.getCollection(
        this.getActiveCollectionId()
      );

      return collection ? collection.name : Storage.ALL_NAME;
    },

    renderEntries() {
      const el = this.elements;

      const entries = Storage.listEntries({
        collectionId: this.getActiveCollectionId(),
        query: el.search.value.trim(),
        sort: el.sort.value
      });

      el.entries.replaceChildren();

      if (el.savedColl) {
        el.savedColl.textContent = this.getActiveCollectionName();
      }

      entries.forEach((entry) => {
        el.entries.appendChild(this.createEntryCard(entry));
      });

      el.empty.hidden = entries.length > 0;
    },

    createEntryCard(entry) {
      const card = document.createElement("article");
      card.className = "dg-entry";
      card.dataset.entryId = entry.id;

      const head = document.createElement("div");
      head.className = "dg-entry-head";

      const info = document.createElement("div");

      const date = document.createElement("p");
      date.className = "dg-entry-date";
      date.textContent = this.formatDate(entry.date);

      const title = document.createElement("h3");
      title.className = "dg-entry-title";
      title.textContent = entry.title || "A little thought";

      info.append(date, title);

      const mood = document.createElement("span");
      mood.className = `dg-entry-mood m-${entry.mood}`;
      mood.textContent = this.getMoodLabel(entry.mood);

      head.append(info, mood);

      const text = document.createElement("p");
      text.className = "dg-entry-text";
      text.textContent = entry.text;

      const actions = document.createElement("div");
      actions.className = "dg-entry-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "dg-act";
      edit.textContent = "✎ Edit";
      edit.addEventListener("click", () => {
        if (Diary) Diary.loadEntry(entry.id);
      });

      const collections = document.createElement("button");
      collections.type = "button";
      collections.className = "dg-act";
      collections.textContent = "▦ Collections";
      collections.addEventListener("click", () => {
        if (Collections) {
          Collections.openEntryCollections(entry.id);
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dg-act danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        this.openDeleteEntry(entry.id);
      });

      actions.append(edit, collections, remove);
      card.append(head, text, actions);

      return card;
    },

    formatDate(value) {
      if (!value) return "";

      const parts = value.split("-");
      if (parts.length !== 3) return value;

      const date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
      );

      return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    },

    getMoodLabel(mood) {
      const labels = {
        joyful: "😊 Joyful",
        calm: "😌 Calm",
        hopeful: "🌤 Hopeful",
        tired: "😴 Tired",
        anxious: "😟 Anxious",
        low: "🌧 Low"
      };

      return labels[mood] || "😌 Calm";
    },

    openDeleteEntry(id) {
      const entry = Storage.getEntry(id);
      if (!entry) return;

      this.deleteEntryId = id;

      this.elements.confirmText.textContent =
        `Delete “${entry.title || "A little thought"}”? This page will be permanently removed from your garden.`;

      this.elements.confirmOk.textContent = "Delete page";
      this.elements.confirmDialog.showModal();
    },

    deleteEntry() {
      if (!this.deleteEntryId) return;

      const result = Storage.deleteEntry(this.deleteEntryId);

      if (!result || !result.ok) {
        this.showToast(
          result && result.message
            ? result.message
            : "Page could not be deleted."
        );
      } else {
        this.showToast("Page deleted.");
      }

      this.deleteEntryId = null;
      this.elements.confirmDialog.close();
      this.renderEntries();
    },

    async readImportFile() {
      const file = this.elements.importFile.files[0];

      if (!file) return;

      const readResult = await Storage.readFileText(file);

      this.elements.importFile.value = "";

      if (!readResult || !readResult.ok) {
        this.showToast(
          readResult && readResult.message
            ? readResult.message
            : "Backup file could not be read."
        );
        return;
      }

      const parsed = Storage.parseImport(readResult.text);

      if (!parsed || !parsed.ok) {
        this.showToast(
          parsed && parsed.message
            ? parsed.message
            : "This is not a valid CalmNest backup."
        );
        return;
      }

      this.importPayload = parsed.payload;

      const summary = parsed.summary;

      this.elements.importSummary.textContent =
        `Backup contains ${summary.entries} page(s) and ${summary.collections} collection(s). Choose whether to merge or replace your current garden.`;

      this.elements.importDialog.showModal();
    },

    applyImport() {
      if (!this.importPayload) return;

      const modeInput = document.querySelector(
        'input[name="dgImportMode"]:checked'
      );

      const mode = modeInput ? modeInput.value : "merge";

      const result = Storage.applyImport(this.importPayload, mode);

      if (!result || !result.ok) {
        this.showToast(
          result && result.message
            ? result.message
            : "Backup could not be imported."
        );
        return;
      }

      this.importPayload = null;
      this.elements.importDialog.close();

      this.renderEntries();

      this.showToast("Garden backup imported successfully 🌱");
    },

    showStorageWarnings() {
      const warnings = Storage.getWarnings();

      if (warnings.length > 0) {
        this.showToast(warnings[0]);
      }
    },

    showToast(message) {
      const toast = document.getElementById("dgToast");
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add("show");

      window.setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    }
  };

  window.CalmNestDG.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init(), {
      once: true
    });
  } else {
    App.init();
  }
})();