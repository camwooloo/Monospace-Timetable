/**
 * Toasts and the one modal. Small, and deliberately not a component system.
 *
 * ⭐ A REFUSAL IS A TOAST AND NEVER A SILENT NO-OP. Every place this app
 * declines to do something — a period that will not delete, a file that will
 * not open — says why in the words the engine gave it.
 */

import { h, button } from "./dom";

let toastHost: HTMLElement | null = null;

export function toast(message: string, kind: "" | "good" | "bad" = "", ms = 4600) {
  if (!toastHost) {
    toastHost = h("div", { id: "toasts" });
    document.body.appendChild(toastHost);
  }
  const el = h(`div.toast${kind ? "." + kind : ""}`, null, message);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s var(--ease), transform .25s var(--ease)";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 260);
  }, ms);
}

let modalHost: HTMLElement | null = null;
function ensureModal(): HTMLElement {
  if (!modalHost) {
    modalHost = h("div", { id: "modal" });
    modalHost.addEventListener("click", (e) => {
      /* ⚠️ ONLY THE SCRIM DISMISSES. A click inside the sheet bubbles up here,
         so testing the target is what stops a click on a label closing it. */
      if (e.target === modalHost) closeModal();
    });
    document.body.appendChild(modalHost);
  }
  return modalHost;
}

let onEsc: ((e: KeyboardEvent) => void) | null = null;

export function closeModal() {
  modalHost?.classList.remove("open");
  if (modalHost) modalHost.innerHTML = "";
  if (onEsc) document.removeEventListener("keydown", onEsc);
  onEsc = null;
}

export function openModal(
  title: string,
  hint: string | null,
  body: Node | null,
  actions: HTMLElement[],
) {
  const host = ensureModal();
  host.innerHTML = "";
  host.appendChild(
    h(
      "div.sheet",
      { role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h2", null, title),
      hint ? h("p.hint", null, hint) : null,
      body,
      h("div.acts", null, ...actions),
    ),
  );
  host.classList.add("open");
  onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", onEsc);
}

/**
 * A confirm that names what is about to be lost.
 *
 * ⚠️ THE CONFIRM BUTTON CARRIES THE VERB, never "OK". "OK" on a dialog headed
 * "Delete this year?" is a person clicking past a sentence they did not read.
 */
export function confirmDialog(
  title: string,
  message: string,
  verb: string,
  onconfirm: () => void,
  danger = true,
) {
  openModal(title, message, null, [
    button("Cancel", { cls: "ghost", onclick: closeModal }),
    button(verb, {
      cls: danger ? "danger" : "primary",
      onclick: () => {
        closeModal();
        onconfirm();
      },
    }),
  ]);
}
