import "./styles.css";

const grid = document.querySelector<HTMLDivElement>("#game-grid");
const searchInput = document.querySelector<HTMLInputElement>("#game-search");
const emptyMessage = document.querySelector<HTMLParagraphElement>("#empty-message");

if (!grid || !searchInput || !emptyMessage) {
  throw new Error("Homepage markup is missing required elements.");
}

const gameGrid = grid;
const search = searchInput;
const empty = emptyMessage;
const cards = [...gameGrid.querySelectorAll<HTMLAnchorElement>(".game-card")];

function renderCards(query = ""): void {
  const normalizedQuery = query.trim().toLowerCase();
  let visibleCount = 0;

  for (const card of cards) {
    const name = card.dataset.gameName ?? card.textContent ?? "";
    const isVisible = name.toLowerCase().includes(normalizedQuery);
    card.hidden = !isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  }

  empty.hidden = visibleCount > 0;
}

search.addEventListener("input", () => renderCards(search.value));

renderCards();
