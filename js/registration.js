// Jotform sends resize messages as either setHeight:<height>:<form ID>
// or an object. Accept only messages from the embedded registration form.
(function () {
  const iframe = document.getElementById('JotFormIFrame-251228111219042');
  if (!iframe) return;

  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow || event.origin !== new URL(iframe.src).origin) return;

    let height;
    if (typeof event.data === 'string') {
      const parts = event.data.split(':');
      if (parts[0] !== 'setHeight' || parts[2] !== '251228111219042') return;
      height = Number(parts[1]);
    } else if (event.data && event.data.action === 'setHeight') {
      height = Number(event.data.height);
    }

    if (Number.isFinite(height) && height > 0 && height <= 50000) {
      iframe.style.height = `${Math.ceil(height)}px`;
    }
  });
})();
