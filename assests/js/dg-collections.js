(() => {
  "use strict";

  window.CalmNestDG = window.CalmNestDG || {};

  const Storage = window.CalmNestDG.Storage;

  if (!Storage) {
    console.error("CalmNestDG.Storage is not loaded.");
    return;
  }

  const Collections = {
    initialized: false,
    activeId: Storage.ALL_ID,
    editingId: null,
    pendingDeleteId: null,
    pendingEntryId: null,

    elements: {},

    init() {
      if (this.initialized) return;

      this.elements = {
        tabs: document.getElementById("dgTabs"),
        actions: document.getElementById("dgCollActions"),
        rename: document.getElementById("dgRename"),
        delete: document.getElementById("dgDeleteColl"),
        newButton: document.getElementById("dgNewColl"),

        nameDialog: document.getElementById("dgNameDlg"),
        nameForm: document.getElementById("dgNameForm"),
        nameInput: document.getElementById("dgNameInput"),
        nameTitle: document.getElementById("dgNameTitle"),
        nameSub: document.getElementById("dgNameSub"),
        nameError: document.getElementById("dgNameErr"),
        nameCancel: document.getElementById("dgNameCancel"),
        nameOk: document.getElementById("dgNameOk"),

        confirmDialog: document.getElementById("dgConfirmDlg"),
        confirmText: document.getElementById("dgConfirmText"),
        confirmCancel: document.getElementById("dgConfirmCancel"),
        confirmOk: document.getElementById("dgConfirmOk"),

        pickDialog: document.getElementById("dgPickDlg"),
        pickList: document.getElementById("dgPickList"),
        pickCancel: document.getElementById("dgPickCancel"),
        pickOk: document.getElementById("dgPickOk"),

        entryCollections: document.getElementById("dgEntryColls"),
        toast: document.getElementById("dgToast")
      };

      this.bindEvents();

      Storage.init();
      this.renderTabs();
      this.renderEntryCollections();

      Storage.subscribe(() => {
        this.renderTabs();
        this.renderEntryCollections();
      });

      this.initialized = true;
    },

    bindEvents() {
      const el = this.elements;

      el.newButton.addEventListener("click", () => {
        this.openNameDialog("create");
      });

      el.rename.addEventListener("click", () => {
        if (this.activeId !== Storage.ALL_ID) {
          this.openNameDialog("rename", this.activeId);
        }
      });

      el.delete.addEventListener("click", () => {
        if (this.activeId !== Storage.ALL_ID) {
          this.openDeleteDialog(this.activeId);
        }
      });

      el.nameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.saveCollectionName();
      });

      el.nameCancel.addEventListener("click", () => {
        el.nameDialog.close();
      });

      el.confirmCancel.addEventListener("click", () => {
        el.confirmDialog.close();
      });

      el.confirmOk.addEventListener("click", () => {
        this.deleteCollection();
      });

      el.pickCancel.addEventListener("click", () => {
        el.pickDialog.close();
      });

      el.pickOk.addEventListener("click", () => {
        this.saveEntryCollections();
      });
    },

    getCollections() {
      return Storage.listTabs().filter(
        (item) => item.id !== Storage.ALL_ID
      );
    },

    getActiveCollection() {
      if (this.activeId === Storage.ALL_ID) {
        return {
          id: Storage.ALL_ID,
          name: Storage.ALL_NAME
        };
      }

      return Storage.getCollection(this.activeId);
    },

    selectCollection(id) {
      this.activeId = id || Storage.ALL_ID;

      this.renderTabs();
      this.renderEntryCollections();

      const collection = this.getActiveCollection();

      document.dispatchEvent(
        new CustomEvent("calmnest:collection-changed", {
          detail: {
            collectionId: this.activeId,
            collectionName: collection
              ? collection.name
              : Storage.ALL_NAME
          }
        })
      );
    },

    renderTabs() {
      const container = this.elements.tabs;
      if (!container) return;

      const tabs = Storage.listTabs();
      container.replaceChildren();

      tabs.forEach((collection) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dg-tab";
        button.dataset.coll = collection.id;
        button.setAttribute(
          "aria-selected",
          String(collection.id === this.activeId)
        );

        const name = document.createElement("span");
        name.textContent = collection.name;

        const count = document.createElement("b");
        count.className = "dg-tab-n";

        const entries = Storage.listEntries({
          collectionId: collection.id,
          sort: "new"
        });

        count.textContent = entries.length;

        button.append(name, count);

        button.addEventListener("click", () => {
          this.selectCollection(collection.id);
        });

        container.appendChild(button);
      });

      const isAll = this.activeId === Storage.ALL_ID;

      this.elements.actions.hidden = isAll;
      this.elements.rename.disabled = isAll;
      this.elements.delete.disabled = isAll;
    },

    renderEntryCollections(selectedIds = null) {
      const container = this.elements.entryCollections;
      if (!container) return;

      const collections = this.getCollections();

      container.replaceChildren();

      if (collections.length === 0) {
        const message = document.createElement("p");
        message.className = "dg-muted";
        message.textContent =
          "No collections yet. Create one above to group your pages.";
        container.appendChild(message);
        return;
      }

      const selected = new Set(selectedIds || []);

      collections.forEach((collection) => {
        const label = document.createElement("label");
        label.className = "dg-chip";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = collection.id;
        checkbox.checked = selected.has(collection.id);

        const name = document.createElement("span");
        name.textContent = collection.name;

        label.append(checkbox, name);
        container.appendChild(label);
      });
    },

    openNameDialog(mode, id = null) {
      this.editingId = mode === "rename" ? id : null;

      const el = this.elements;

      el.nameError.hidden = true;
      el.nameError.textContent = "";

      if (mode === "rename") {
        const collection = Storage.getCollection(id);

        if (!collection) {
          this.showToast("Collection could not be found.");
          return;
        }

        el.nameTitle.textContent = "Rename collection";
        el.nameSub.textContent = "Choose a new name for this garden.";
        el.nameOk.textContent = "Save";
        el.nameInput.value = collection.name;
      } else {
        el.nameTitle.textContent = "New collection";
        el.nameSub.textContent =
          "Give this garden a name, like “Midnight Thoughts” or “My Happy Place”.";
        el.nameOk.textContent = "Create";
        el.nameInput.value = "";
      }

      el.nameDialog.showModal();
      el.nameInput.focus();
    },

    saveCollectionName() {
      const name = this.elements.nameInput.value.trim();
      const el = this.elements;

      el.nameError.hidden = true;
      el.nameError.textContent = "";

      if (!name) {
        el.nameError.textContent = "Please enter a collection name.";
        el.nameError.hidden = false;
        el.nameInput.focus();
        return;
      }

      let result;

      if (this.editingId) {
        result = Storage.renameCollection(this.editingId, name);
      } else {
        result = Storage.createCollection(name);
      }

      if (!result || !result.ok) {
        el.nameError.textContent =
          result && result.message
            ? result.message
            : "Could not save this collection. Please try again.";

        el.nameError.hidden = false;
        return;
      }

      const collection = result.collection || result;

      if (!this.editingId && collection.id) {
        this.activeId = collection.id;
      }

      el.nameDialog.close();

      this.renderTabs();
      this.renderEntryCollections();

      document.dispatchEvent(
        new CustomEvent("calmnest:collection-changed", {
          detail: {
            collectionId: this.activeId,
            collectionName: collection.name || name
          }
        })
      );

      this.showToast(
        this.editingId
          ? "Collection renamed ✨"
          : "New collection created 🌱"
      );

      this.editingId = null;
    },

    openDeleteDialog(id) {
      const collection = Storage.getCollection(id);
      if (!collection) return;

      this.pendingDeleteId = id;

      this.elements.confirmText.textContent =
        `Delete “${collection.name}”? The pages inside it will remain in All Thoughts.`;

      this.elements.confirmOk.textContent = "Delete collection";
      this.elements.confirmDialog.showModal();
    },

    deleteCollection() {
      if (!this.pendingDeleteId) return;

      const result = Storage.deleteCollection(this.pendingDeleteId);

      if (!result || !result.ok) {
        this.showToast(
          result && result.message
            ? result.message
            : "Could not delete this collection."
        );

        this.elements.confirmDialog.close();
        return;
      }

      this.activeId = Storage.ALL_ID;
      this.pendingDeleteId = null;

      this.elements.confirmDialog.close();

      this.renderTabs();
      this.renderEntryCollections();

      document.dispatchEvent(
        new CustomEvent("calmnest:collection-changed", {
          detail: {
            collectionId: Storage.ALL_ID,
            collectionName: Storage.ALL_NAME
          }
        })
      );

      this.showToast("Collection deleted.");
    },

    openEntryCollections(entryId) {
      this.pendingEntryId = entryId;

      const selectedIds = Storage.getEntryCollectionIds(entryId);

      this.elements.pickList.replaceChildren();

      this.getCollections().forEach((collection) => {
        const label = document.createElement("label");
        label.className = "dg-check";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = collection.id;
        checkbox.checked = selectedIds.includes(collection.id);

        const text = document.createElement("span");
        text.textContent = collection.name;

        label.append(checkbox, text);
        this.elements.pickList.appendChild(label);
      });

      if (this.getCollections().length === 0) {
        const message = document.createElement("p");
        message.className = "dg-muted";
        message.textContent =
          "Create a collection first to group your pages.";
        this.elements.pickList.appendChild(message);
      }

      this.elements.pickDialog.showModal();
    },

    saveEntryCollections() {
      if (!this.pendingEntryId) return;

      const selectedIds = Array.from(
        this.elements.pickList.querySelectorAll(
          'input[type="checkbox"]:checked'
        )
      ).map((checkbox) => checkbox.value);

      const result = Storage.setEntryCollections(
        this.pendingEntryId,
        selectedIds
      );

      if (!result || !result.ok) {
        this.showToast(
          result && result.message
            ? result.message
            : "Could not update page collections."
        );
        return;
      }

      this.elements.pickDialog.close();
      this.pendingEntryId = null;

      this.renderTabs();
      this.showToast("Page collections updated 🌱");
    },

    showToast(message) {
      const toast = this.elements.toast;
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add("show");

      window.setTimeout(() => {
        toast.classList.remove("show");
      }, 2800);
    }
  };

  window.CalmNestDG.Collections = Collections;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Collections.init(), {
      once: true
    });
  } else {
    Collections.init();
  }
})();