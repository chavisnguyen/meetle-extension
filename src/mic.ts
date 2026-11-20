// An offscreen document cannot show a permission prompt, so ask once in a normal tab.
const note = document.getElementById("m")!;
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((s) => {
    s.getTracks().forEach((t) => t.stop());
    note.textContent = "Xong. Đóng tab này và bấm Ghi lại.";
  })
  .catch(() => {
    note.textContent = "Bị từ chối. Cho phép mic cho extension trong cài đặt Chrome.";
  });
