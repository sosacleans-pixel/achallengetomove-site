/** Render a shareable completion card (no photos unless user adds one). */

export async function renderCompletionCard({ name, mode, stats, includePhotoBlob = null }) {
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff7e8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, w, 12);
  ctx.fillStyle = "#ffc700";
  ctx.fillRect(0, 12, w, 8);

  ctx.fillStyle = "#1e1e1e";
  ctx.font = "bold 56px Anton, Impact, sans-serif";
  ctx.fillText("75 DAYS COMPLETE", 60, 120);
  ctx.font = "32px Lato, sans-serif";
  ctx.fillText("A Challenge to Move", 60, 170);

  ctx.font = "28px Lato, sans-serif";
  const modeLabel = mode === "adaptive" ? "75 Adaptive" : "75 All-In";
  ctx.fillText(modeLabel, 60, 230);
  if (name) {
    ctx.fillStyle = "#bf3404";
    ctx.fillText(name, 60, 280);
  }

  const lines = [
    `Workouts: ${stats.workouts}`,
    `Training minutes: ${stats.minutes}`,
    `Pages read: ${stats.pages}`,
    `Best streak: ${stats.bestStreak}`,
    `Attempt: ${stats.attemptNumber}`,
  ];
  ctx.fillStyle = "#1e1e1e";
  let y = 360;
  for (const line of lines) {
    ctx.fillText(line, 60, y);
    y += 48;
  }

  if (includePhotoBlob) {
    const bmp = await createImageBitmap(includePhotoBlob);
    const pw = 400;
    const ph = 400;
    ctx.drawImage(bmp, w - pw - 60, h - ph - 120, pw, ph);
  }

  ctx.fillStyle = "#5e584c";
  ctx.font = "22px Lato, sans-serif";
  ctx.fillText("Coach Salim Heyaime LLC · Not medical advice.", 60, h - 60);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}
