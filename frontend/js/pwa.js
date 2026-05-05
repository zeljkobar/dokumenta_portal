(function () {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  let deferredPrompt = null;

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isInstallSecureContext() {
    return window.location.protocol === "https:" || isLocalhost;
  }

  function createInstallButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pwa-install-btn";
    button.id = "pwaInstallBtn";
    button.textContent = "Instaliraj aplikaciju";
    document.body.appendChild(button);
    return button;
  }

  function showInfoHint(title, message, force = false) {
    const existing = document.getElementById("pwaRuntimeHint");
    if (existing) existing.remove();

    if (!force) {
      const alreadyShown = sessionStorage.getItem("pwaRuntimeHintShown");
      if (alreadyShown) return;
    }

    const hint = document.createElement("div");
    hint.className = "pwa-ios-hint";
    hint.id = "pwaRuntimeHint";
    hint.innerHTML = `<strong>${title}</strong> ${message}`;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "pwa-ios-hint-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "x";
    close.addEventListener("click", () => {
      hint.remove();
    });

    hint.appendChild(close);
    document.body.appendChild(hint);
    sessionStorage.setItem("pwaRuntimeHintShown", "1");
  }

  function showIosHint(force = false) {
    if (!isIos() || isStandalone()) return;

    showInfoHint(
      "Instaliraj aplikaciju:",
      "Safari -> Share -> Add to Home Screen",
      force
    );
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (error) {
      console.warn("Service worker registration failed:", error);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();

    if (isStandalone()) return;

    const installButton = createInstallButton();

    if (isIos()) {
      installButton.textContent = "Kako instalirati aplikaciju";
    } else if (!isInstallSecureContext()) {
      installButton.textContent = "Instalacija trazi HTTPS";
    } else {
      installButton.textContent = "Instaliraj aplikaciju";
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installButton.textContent = "Instaliraj aplikaciju";
    });

    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        if (isIos()) {
          showIosHint(true);
          return;
        }

        if (!isInstallSecureContext()) {
          showInfoHint(
            "Instalacija nije dostupna:",
            "otvorite aplikaciju preko HTTPS domene da biste dobili Install app.",
            true
          );
          return;
        }

        showInfoHint(
          "Install app jos nije ponuden:",
          "provjerite da ste u podrzanom browseru (Chrome/Edge) i da je service worker ucitan.",
          true
        );
        return;
      }

      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice && choice.outcome !== "accepted") {
        installButton.classList.remove("d-none");
      } else {
        installButton.classList.add("d-none");
      }

      deferredPrompt = null;
    });

    window.addEventListener("appinstalled", () => {
      installButton.classList.add("d-none");
      deferredPrompt = null;
    });

    if (isIos()) {
      showIosHint();
    }
  });
})();
