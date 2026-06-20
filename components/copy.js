export async function copyText(text, toastElement) {
  if (!text) {
    showToast("Nothing to copy yet.", toastElement);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard.", toastElement);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    showToast("Copied to clipboard.", toastElement);
  }
}

export function showToast(message, toastElement) {
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toastElement.classList.remove("visible");
  }, 2400);
}
