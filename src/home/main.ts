import "./styles.css";

interface GameCard {
  name: string;
  href: string;
  image: string;
  status: "ready" | "placeholder";
}

const games: GameCard[] = [
  {
    name: "Pong",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/pong.svg",
    status: "placeholder"
  },
  {
    name: "Pac-Man",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/pacman.svg",
    status: "placeholder"
  },
  {
    name: "Space Invaders",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/space-invaders.svg",
    status: "placeholder"
  },
  {
    name: "Tron",
    href: "./apps/blank-2d/",
    image: "./assets/placeholders/tron.svg",
    status: "placeholder"
  },
  {
    name: "3D Template",
    href: "./apps/blank-3d/",
    image: "./assets/placeholders/three-d.svg",
    status: "ready"
  },
  {
    name: "First Person Template",
    href: "./apps/blank-3d/",
    image: "./assets/placeholders/first-person.svg",
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
      overlay.className = "game-title";
      overlay.textContent = game.name;

      const badge = document.createElement("span");
      badge.className = `status status-${game.status}`;
      badge.textContent = game.status === "ready" ? "Ready" : "Placeholder";

      card.append(image, overlay, badge);
      return card;
    })
  );

  empty.hidden = visibleGames.length > 0;
}

search.addEventListener("input", () => renderCards(search.value));

renderCards();
