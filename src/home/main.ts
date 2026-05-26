import "./styles.css";

interface GameCard {
  name: string;
  href: string;
  image: string;
  description: string;
  status: "ready" | "placeholder";
}

const games: GameCard[] = [
  {
    name: "2D Test Game",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/test-2d.svg",
    description: "Canvas test scene with keyboard movement.",
    status: "ready"
  },
  {
    name: "3D Test Game",
    href: "./apps/blank-3d/",
    image: "./assets/placeholders/test-3d.svg",
    description: "Three.js test scene with a rotating cube.",
    status: "ready"
  },
  {
    name: "Pong",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/pong.svg",
    description: "Classic paddle game slot.",
    status: "placeholder"
  },
  {
    name: "Pac-Man",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/pacman.svg",
    description: "Maze chase game slot.",
    status: "placeholder"
  },
  {
    name: "Space Invaders",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/space-invaders.svg",
    description: "Fixed shooter game slot.",
    status: "placeholder"
  },
  {
    name: "Tron",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/tron.svg",
    description: "Light-cycle arena game slot.",
    status: "placeholder"
  },
  {
    name: "3D Template",
    href: "./apps/blank-3d/",
    image: "./assets/placeholders/three-d.svg",
    description: "General 3D starter scene.",
    status: "ready"
  },
  {
    name: "First Person Template",
    href: "./apps/blank-3d/",
    image: "./assets/placeholders/first-person.svg",
    description: "First-person prototype slot.",
    status: "placeholder"
  }
];

const grid = document.querySelector<HTMLDivElement>("#game-grid");
const searchInput = document.querySelector<HTMLInputElement>("#game-search");
const emptyMessage = document.querySelector<HTMLParagraphElement>("#empty-message");

if (!grid || !searchInput || !emptyMessage) {
  throw new Error("Homepage markup is missing required elements.");
}

const gameGrid = grid;
const search = searchInput;
const empty = emptyMessage;

function renderCards(query = ""): void {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGames = games.filter((game) => game.name.toLowerCase().includes(normalizedQuery));

  gameGrid.replaceChildren(
    ...visibleGames.map((game) => {
      const card = document.createElement("a");
      card.className = "game-card";
      card.href = game.href;
      card.setAttribute("aria-label", `Play ${game.name}`);

      const image = document.createElement("img");
      image.src = game.image;
      image.alt = "";
      image.loading = "lazy";

      const overlay = document.createElement("span");
      overlay.className = "game-info";

      const title = document.createElement("span");
      title.className = "game-title";
      title.textContent = game.name;

      const description = document.createElement("span");
      description.className = "game-description";
      description.textContent = game.description;

      const badge = document.createElement("span");
      badge.className = `status status-${game.status}`;
      badge.textContent = game.status === "ready" ? "Ready" : "Placeholder";

      overlay.append(title, description);
      card.append(image, overlay, badge);
      return card;
    })
  );

  empty.hidden = visibleGames.length > 0;
}

search.addEventListener("input", () => renderCards(search.value));

renderCards();
