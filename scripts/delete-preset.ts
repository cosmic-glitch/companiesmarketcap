import { getUserPresets, writeUserPresets } from "../lib/db";

const TARGET_ID = process.argv[2];
if (!TARGET_ID) {
  console.error("Usage: tsx scripts/delete-preset.ts <preset-id>");
  process.exit(1);
}

(async () => {
  const presets = await getUserPresets();
  const before = presets.length;
  const target = presets.find((p) => p.id === TARGET_ID);
  if (!target) {
    console.error(`No preset with id ${TARGET_ID}; nothing to delete.`);
    process.exit(2);
  }
  const next = presets.filter((p) => p.id !== TARGET_ID);
  await writeUserPresets(next);
  console.log(`Deleted: ${target.label} (${target.id})`);
  console.log(`Presets: ${before} -> ${next.length}`);
})();
