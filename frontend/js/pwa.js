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

  function createInstallButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pwa-install-btn d-none";
    button.id = "pwaInstallBtn";
    button.textContent = "Instaliraj aplikaciju";
    document.body.appendChild(button);
    return button;
  }

  function showIosHint() {
    if (!isIos() || isStandalone()) return;

    const alreadyShown = sessionStorage.getItem("iosInstallHintShown");
    if (alreadyShown) return;

    const hint = document.createElement("div");
    hint.className = "pwa-ios-hint";
    hint.innerHTML =
      '<strong>Instaliraj aplikaciju:</strong> Safari -> Share -> Add to Home Screen';

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
    sessionStorage.setItem("iosInstallHintShown", "1");
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (error) {
      console.warn("Service worker registration failed:", error);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();

    if (isStandalone()) return;

    const installButton = createInstallButton();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installButton.classList.remove("d-none");
    });

    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        showIosHint();
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

    if (!isLocalhost && !isIos()) {
      setTimeout(() => {
        if (!deferredPrompt) {
          installButton.classList.add("d-none");
        }
      }, 4000);
    }
  });
})();
