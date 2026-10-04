export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
export const main = document.querySelector('main');
export function announce(message) { document.querySelector('#status').textContent = message; }
export function focusMain() { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
export function confirmAction(title, text, label, action, cancelLabel = 'Keep practising') {
  document.querySelector('dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2 id="dialog-title">${escape(title)}</h2><p>${escape(text)}</p><div class="small-actions"><button class="secondary" data-cancel autofocus>${escape(cancelLabel)}</button><button class="primary" data-confirm>${escape(label)}</button></div>`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-confirm]').onclick = () => { dialog.close(); action(); };
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}
