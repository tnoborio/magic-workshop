const id = location.pathname.split("/").filter(Boolean)[1];
const frame = document.querySelector("#app");
const waiting = document.querySelector("#waiting");
const wand = document.querySelector("#wand");
const flash = document.querySelector("#flash");
let shown = 0,
  latest = 0,
  lastEvent = Date.now();
function load(version) {
  shown = version;
  latest = version;
  frame.src = `/t/${id}/app?v=${version}`;
  frame.style.display = "block";
  waiting.style.display = "none";
  wand.classList.remove("show");
}
function offer(version) {
  latest = Math.max(latest, Number(version));
  if (latest > shown) wand.classList.add("show");
}
async function poll() {
  try {
    const response = await fetch(`/t/${id}/state`, { cache: "no-store" });
    const data = await response.json();
    if (!shown && data.version) load(data.version);
    else offer(data.version);
  } catch {}
}
wand.addEventListener("click", () => {
  if (!latest) return;
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");
  setTimeout(() => load(latest), 250);
});
await poll();
const events = new EventSource(`/t/${id}/events`);
events.onopen = () => {
  lastEvent = Date.now();
};
events.addEventListener("version", (event) => {
  lastEvent = Date.now();
  offer(JSON.parse(event.data).version);
});
events.onerror = () => {};
setInterval(() => {
  if (Date.now() - lastEvent > 5000) poll();
}, 5000);
