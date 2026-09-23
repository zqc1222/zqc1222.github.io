const menuButton = document.querySelector(".menu-toggle");
const themeButton = document.querySelector(".theme-toggle");
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  if (themeButton) {
    themeButton.setAttribute(
      "aria-label",
      dark ? "切换到日间模式" : "切换到夜间模式",
    );
    themeButton.setAttribute(
      "title",
      dark ? "切换到日间模式" : "切换到夜间模式",
    );
    themeButton.setAttribute("aria-pressed", String(dark));
    themeButton.querySelector("span").textContent = dark ? "☀" : "☾";
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#080d16" : "#f5f5f7");
}
updateThemeButton();
themeButton?.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("site-theme", dark ? "dark" : "light");
  } catch {}
  updateThemeButton();
});
const navigation = document.querySelector("#navigation");
function closeMenu() {
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "打开导航");
  navigation?.classList.remove("is-open");
}
menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  navigation?.classList.toggle("is-open", open);
});
navigation
  ?.querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton?.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
window.matchMedia("(min-width: 601px)").addEventListener("change", closeMenu);
const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
document
  .querySelector(".copy-wechat")
  ?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = document.querySelector("#copy-status");
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      status.textContent = "微信号已复制";
    } catch {
      status.textContent = `请长按或选择微信号复制：${button.dataset.copy}`;
    }
  });
document
  .querySelector("[data-print]")
  ?.addEventListener("click", () => window.print());
