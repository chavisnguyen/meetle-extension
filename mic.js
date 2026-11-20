// An offscreen document cannot show a permission prompt, so ask once in a normal tab.
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((s) => { s.getTracks().forEach((t) => t.stop()); document.getElementById('m').textContent = 'Xong. Đóng tab này và bấm Ghi lại.'; })
  .catch(() => { document.getElementById('m').textContent = 'Bị từ chối. Cho phép mic cho extension trong cài đặt Chrome.'; });
