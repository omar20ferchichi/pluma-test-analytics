/**
 * Import new test_entretien runs without wiping the database.
 *   npm run import:reports                      # ../test_entretien/reports
 *   npm run import:reports -- /path/to/reports  # any reports folder
 */
import { prisma } from "./lib/prisma.js";
import { defaultReportsDir, importReportsDir } from "./lib/pluma-reports.js";

async function main() {
  const dir = process.argv[2] ?? defaultReportsDir();
  const project =
    (await prisma.project.findFirst({ where: { slug: process.env.PROJECT_SLUG ?? "pluma-e2e" } })) ??
    (await prisma.project.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!project) throw new Error("No project found. Run `npm run db:seed` first.");
  console.log(`Importing runs from ${dir} into ${project.name}`);
  const result = await importReportsDir(project.id, dir);
  console.log(`${result.imported.length} imported, ${result.skipped.length} skipped.`);
  for (const skip of result.skipped.filter((item) => item.reason !== "already imported")) {
    console.log(`  skipped ${skip.run}: ${skip.reason}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
