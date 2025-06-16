import { api } from "./utils/browser";

const KEY = window.location.href;

// Create floating container
const container = document.createElement("div");
container.id = "ld-container";
Object.assign(container.style, {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  zIndex: "2147483647",
  display: "flex",
  flexDirection: "row",
  gap: "8px",
  alignItems: "center",
  background: "rgba(0,0,0,0.4)",
  padding: "4px 8px",
  borderRadius: "9999px",
  backdropFilter: "blur(6px)",
  color: "#fff",
  userSelect: "none",
  transition: "opacity 0.2s ease",
});

const likeBtn = document.createElement("button");
likeBtn.textContent = "👍";
const dislikeBtn = document.createElement("button");
dislikeBtn.textContent = "👎";
[likeBtn, dislikeBtn].forEach((btn) => {
  Object.assign(btn.style, {
    fontSize: "20px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "2px 6px",
  });
});

const countSpan = document.createElement("span");
Object.assign(countSpan.style, {
  position: "absolute",
  top: "-26px",
  left: "50%",
  transform: "translateX(-50%)",
  fontSize: "13px",
  whiteSpace: "nowrap",
  background: "rgba(0,0,0,0.6)",
  padding: "2px 6px",
  borderRadius: "6px",
  pointerEvents: "none",
});

container.appendChild(likeBtn);
container.appendChild(dislikeBtn);
container.appendChild(countSpan);
document.body.appendChild(container);

function disableButtons() {
  likeBtn.disabled = true;
  dislikeBtn.disabled = true;
  container.style.opacity = "0.5";
}

function markVotedLocally() {
  api.storage.local.set({ [KEY]: true });
  disableButtons();
}

async function checkAlreadyVoted() {
  const stored = await api.storage.local.get(KEY);
  if (stored[KEY]) {
    disableButtons();
  }
}

checkAlreadyVoted();

function setLikesDislikes(resp: {likes: number; dislikes: number}) {
  countSpan.textContent = `${resp.likes} 👍  ·  ${resp.dislikes} 👎`;
}

function sendVote(value: 1 | -1) {
  if (likeBtn.disabled) return;
  disableButtons();
  api.runtime.sendMessage(
    {
      type: "vote",
      url: window.location.href,
      value,
    },
    (resp) => {
      if (!resp?.ok) {
        likeBtn.disabled = dislikeBtn.disabled = false;
        container.style.opacity = "1";
        console.error(`Vote failed:`, resp);
        return;
      }
      console.debug(`Vote successful`);
      markVotedLocally();
      setLikesDislikes(resp as { likes: number; dislikes: number });
    }
  );
}

likeBtn.addEventListener("click", () => sendVote(1));
dislikeBtn.addEventListener("click", () => sendVote(-1));

let countsFetched = false;
container.addEventListener("mouseenter", () => {
  if (countsFetched) return;
  countSpan.textContent = "Loading...";
  api.runtime.sendMessage(
    { type: "counts", url: window.location.href },
    (resp) => {
      if (!resp?.ok) {
        countSpan.textContent = ""; // hide on failure
        console.error(`Failed to fetch counts:`, resp);
        return;
      }
      console.debug(`Counts fetched successfully`, resp);
      countsFetched = true;
      setLikesDislikes(resp as { likes: number; dislikes: number });
    }
  );
});
