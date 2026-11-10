(() => {
  "use strict";

  window.CalmNestDG = window.CalmNestDG || {};

  const Storage = window.CalmNestDG.Storage;
  const Stickers = window.CalmNestDG.Stickers;

  if (!Storage) {
    console.error("CalmNestDG.Storage is not loaded.");
    return;
  }

  const Garden = {
    initialized: false,

    elements: {},

    init() {
      if (this.initialized) return;

      this.elements = {
        scene: document.getElementById("dgScene"),
        plot: document.getElementById("dgPlot"),
        creatures: document.getElementById("dgCreatures"),
        empty: document.getElementById("dgGardenEmpty"),
        meta: document.getElementById("dgGardenMeta"),
        statEntries: document.getElementById("dgStatEntries"),
        statStage: document.getElementById("dgStatStage"),
        statColls: document.getElementById("dgStatColls"),
        stageBar: document.getElementById("dgStageBar"),
        stageNote: document.getElementById("dgStageNote")
      };

      if (!this.elements.plot) {
        console.warn("Garden plot element #dgPlot was not found.");
        return;
      }

      Storage.init();

      this.unsubscribe = Storage.subscribe(() => {
        this.render();
      });

      this.initialized = true;
      this.render();
    },

    getEntries() {
      return Storage.listEntries({
        collectionId: Storage.ALL_ID,
        sort: "old"
      }) || [];
    },

    getStage(count) {
      if (count >= 30) {
        return {
          name: "Flourishing Garden",
          note: "Your garden is flourishing with care and memories."
        };
      }

      if (count >= 15) {
        return {
          name: "Blooming Garden",
          note: "Your little garden is growing beautifully."
        };
      }

      if (count >= 7) {
        return {
          name: "Growing Garden",
          note: "Every thought helps your garden grow."
        };
      }

      if (count >= 1) {
        return {
          name: "Little Garden",
          note: "Your first thoughts have planted the seeds."
        };
      }

      return {
        name: "A New Beginning",
        note: "Write your first thought to plant a seed."
      };
    },

    getPlant(entry, index) {
      const moods = {
        joyful: "🌼",
        calm: "🌿",
        hopeful: "🌷",
        tired: "🌱",
        anxious: "🍃",
        low: "🌸"
      };

      const symbols = ["🌱", "🌷", "🌼", "🌿", "🌸", "🪻"];
      const mood = entry.mood || "calm";

      return moods[mood] || symbols[index % symbols.length];
    },

    getPosition(entry, index, total) {
      const seed = String(entry.id || index)
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);

      const x = 8 + ((seed * 17 + index * 23) % 84);
      const y = 12 + ((seed * 11 + index * 13) % 65);

      return {
        x: Math.max(5, Math.min(95, x)),
        y: Math.max(8, Math.min(82, y))
      };
    },

    createPlant(entry, index, total) {
      const plant = document.createElement("div");
      const position = this.getPosition(entry, index, total);

      plant.className = "dg-garden-plant";
      plant.dataset.entryId = entry.id;
      plant.style.left = `${position.x}%`;
      plant.style.top = `${position.y}%`;

      const flower = document.createElement("span");
      flower.className = "dg-garden-plant-icon";
      flower.textContent = this.getPlant(entry, index);
      flower.setAttribute("aria-hidden", "true");

      const title = document.createElement("span");
      title.className = "dg-garden-plant-title";
      title.textContent = entry.title || "A little thought";

      plant.append(flower, title);
      plant.title = entry.title || "A little thought";

      return plant;
    },

    renderPlants(entries) {
      const plot = this.elements.plot;
      plot.replaceChildren();

      entries.forEach((entry, index) => {
        plot.appendChild(this.createPlant(entry, index, entries.length));
      });

      if (this.elements.empty) {
        this.elements.empty.hidden = entries.length > 0;
      }
    },

    renderCreatures(count) {
      const container = this.elements.creatures;
      if (!container) return;

      container.replaceChildren();

      if (count < 3) return;

      const creatures = count >= 15
        ? ["🦋", "🐝", "🐞"]
        : count >= 7
          ? ["🦋", "🐝"]
          : ["🦋"];

      creatures.forEach((symbol, index) => {
        const creature = document.createElement("span");
        creature.className = "dg-garden-creature";
        creature.textContent = symbol;
        creature.setAttribute("aria-hidden", "true");
        creature.style.animationDelay = `${index * 0.7}s`;
        container.appendChild(creature);
      });
    },

    renderStats(entries) {
      const stats = Storage.getStats();
      const count = entries.length;
      const stage = this.getStage(count);

      if (this.elements.statEntries) {
        this.elements.statEntries.textContent = count;
      }

      if (this.elements.statStage) {
        this.elements.statStage.textContent = stage.name;
      }

      if (this.elements.statColls) {
        this.elements.statColls.textContent =
          stats && typeof stats.collections === "number"
            ? stats.collections
            : Storage.listTabs().length;
      }

      if (this.elements.stageBar) {
        const progress = Math.min(100, (count / 30) * 100);
        this.elements.stageBar.style.width = `${progress}%`;
        this.elements.stageBar.setAttribute("aria-valuenow", String(count));
        this.elements.stageBar.setAttribute("aria-valuemax", "30");
      }

      if (this.elements.stageNote) {
        this.elements.stageNote.textContent = stage.note;
      }

      if (this.elements.meta) {
        this.elements.meta.textContent =
          count === 1
            ? "1 thought planted"
            : `${count} thoughts planted`;
      }
    },

    render() {
      if (!this.initialized) return;

      const entries = this.getEntries();

      this.renderPlants(entries);
      this.renderCreatures(entries.length);
      this.renderStats(entries);

      if (this.elements.scene) {
        this.elements.scene.dataset.gardenStage =
          this.getStage(entries.length).name
            .toLowerCase()
            .replaceAll(" ", "-");
      }
    }
  };

  window.CalmNestDG.Garden = Garden;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Garden.init(), {
      once: true
    });
  } else {
    Garden.init();
  }
})();