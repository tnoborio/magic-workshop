const token = new URLSearchParams(location.search).get("token") || "";
const api = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-console-token": token,
      ...options.headers,
    },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(body.error || `エラー (${response.status})`);
    return body;
  });
const state = { teams: [], busy: new Set(), active: "team1" };
const panes = document.querySelector("#panes");
const log = document.querySelector("#log");
const form = document.querySelector("#prompt-form");
const prompt = document.querySelector("#prompt");
const send = document.querySelector("#send");
const modal = document.querySelector("#qr-modal");
const team = (id) => state.teams.find((item) => item.id === id);
const qrUrl = (id) =>
  `/api/teams/${id}/qr${token ? `?token=${encodeURIComponent(token)}` : ""}`;

function renderPanes() {
  panes.innerHTML = state.teams
    .map(
      (
        item,
      ) => `<article class="pane ${item.id === state.active ? "active" : ""} ${state.busy.has(item.id) ? "busy" : ""}" data-id="${item.id}" style="--team:${item.color}">
    <div class="pane-head"><div class="team-name">${escapeHtml(item.emoji)} ${escapeHtml(item.name)}</div><button class="edit-name" title="チーム名を編集">✎</button><img class="qr" src="${qrUrl(item.id)}" alt="${escapeHtml(item.name)}のQRコード"></div>
    <div class="preview-wrap"><div class="thinking"><span>✦ 考え中… ✦</span></div>${item.version ? `<iframe class="preview" sandbox="allow-scripts allow-same-origin" src="/t/${item.id}/app?v=${item.version}" title="${escapeHtml(item.name)}のプレビュー"></iframe>` : '<div class="empty">じゅんびちゅう…<br>最初の注文を待っています</div>'}</div>
  </article>`,
    )
    .join("");
  document.querySelector("#target-name").textContent =
    `${team(state.active).emoji} ${team(state.active).name}`;
  form.style.setProperty("--active", team(state.active).color);
  send.disabled = state.busy.has(state.active);
}
function allHistory() {
  return state.teams
    .flatMap((item) => item.history.map((entry) => ({ ...entry, team: item })))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}
function renderLog() {
  log.innerHTML =
    allHistory()
      .map(
        (item) =>
          `<article class="entry ${item.status}" style="--team:${item.team.color}" data-entry="${item.id}"><div class="entry-head">${escapeHtml(item.team.emoji)} ${escapeHtml(item.team.name)}</div><div class="prompt-text">「${escapeHtml(item.prompt)}」</div><div class="reply">${item.status === "generating" ? "✦ AIが考え中…" : item.status === "failed" ? `うまく魔法をかけられませんでした: ${escapeHtml(item.reply)} <button class="retry">再試行</button>` : `✨ ${escapeHtml(item.reply)}`}</div></article>`,
      )
      .join("") ||
    '<div class="empty-log">注文を送ると、ここにみんなのやり取りが流れます。</div>';
  log.scrollTop = log.scrollHeight;
}
function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
function select(id) {
  state.active = id;
  renderPanes();
  prompt.focus();
}
function updateEntry(teamId, entry) {
  const item = team(teamId);
  const index = item.history.findIndex((value) => value.id === entry.id);
  if (index >= 0) item.history[index] = entry;
  else item.history.push(entry);
  state.busy[entry.status === "generating" ? "add" : "delete"](teamId);
  renderPanes();
  renderLog();
}
panes.addEventListener("click", async (event) => {
  const pane = event.target.closest(".pane");
  if (!pane) return;
  const id = pane.dataset.id;
  select(id);
  if (event.target.closest(".qr")) {
    modal.querySelector("h2").textContent =
      `${team(id).emoji} ${team(id).name}`;
    modal.querySelector("img").src = qrUrl(id);
    modal.showModal();
  }
  if (event.target.closest(".edit-name")) {
    const current = team(id);
    const value = window.prompt(
      "チーム名と絵文字を「🚀 チーム名」の形で入力",
      `${current.emoji} ${current.name}`,
    );
    if (!value) return;
    const parts = value.trim().split(/\s+/);
    const emoji = parts.shift();
    const name = parts.join(" ");
    if (!name) return alert("絵文字の後にチーム名を入力してください");
    try {
      Object.assign(
        current,
        await api(`/api/teams/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ emoji, name }),
        }),
      );
      renderPanes();
      renderLog();
    } catch (error) {
      alert(error.message);
    }
  }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text) return;
  try {
    await api(`/api/teams/${state.active}/generate`, {
      method: "POST",
      body: JSON.stringify({
        prompt: text,
        mode: document.querySelector("#new-mode").checked ? "new" : "edit",
      }),
    });
    prompt.value = "";
  } catch (error) {
    alert(error.message);
  }
});
prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
    form.requestSubmit();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (modal.open) modal.close();
    else document.activeElement?.blur();
    return;
  }
  if (
    !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) &&
    /^[1-4]$/.test(event.key)
  )
    select(`team${event.key}`);
});
log.addEventListener("click", (event) => {
  const button = event.target.closest(".retry");
  if (!button) return;
  const entry = allHistory().find(
    (item) => item.id === button.closest(".entry").dataset.entry,
  );
  select(entry.team.id);
  prompt.value = entry.prompt;
  form.requestSubmit();
});
modal.querySelector(".close").onclick = () => modal.close();

const initial = await api("/api/state");
state.teams = initial.teams;
state.busy = new Set(initial.busy);
renderPanes();
renderLog();
const events = new EventSource(
  `/api/events${token ? `?token=${encodeURIComponent(token)}` : ""}`,
);
events.addEventListener("open", () => {
  document.querySelector("#connection").classList.remove("off");
  document.querySelector("#connection").textContent = "● 接続中";
});
events.onerror = () => {
  document.querySelector("#connection").classList.add("off");
  document.querySelector("#connection").textContent = "● 再接続中";
};
events.addEventListener("history", (event) => {
  const data = JSON.parse(event.data);
  updateEntry(data.teamId, data.entry);
});
events.addEventListener("version", (event) => {
  const data = JSON.parse(event.data);
  team(data.teamId).version = data.version;
  renderPanes();
});
events.addEventListener("team", (event) => {
  const data = JSON.parse(event.data);
  Object.assign(team(data.id), data);
  renderPanes();
  renderLog();
});
events.addEventListener("busy", (event) => {
  const data = JSON.parse(event.data);
  state.busy[data.busy ? "add" : "delete"](data.teamId);
  renderPanes();
});

const canvas = document.querySelector("#stars"),
  ctx = canvas.getContext("2d");
let stars = [];
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3,
    a: Math.random(),
  }));
}
resize();
addEventListener("resize", resize);
function draw(t, once = false) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of stars) {
    ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 1500 + s.a * 6));
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 7);
    ctx.fill();
  }
  if (!once) requestAnimationFrame(draw);
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
  requestAnimationFrame(draw);
else draw(0, true);
