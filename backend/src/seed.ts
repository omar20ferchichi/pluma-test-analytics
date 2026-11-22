import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";
import { id } from "./lib/ids.js";
import { defaultReportsDir, importReportsDir } from "./lib/pluma-reports.js";

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.logLine.deleteMany();
  await prisma.failure.deleteMany();
  await prisma.failureClusterRow.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.qualityConfig.deleteMany();
  await prisma.testPoint.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.jiraTicket.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const org = await prisma.organization.create({
    data: { id: id("org"), name: "Pluma QA", slug: "pluma" },
  });
  const admin = await prisma.user.create({
    data: { id: id("usr"), email: "admin@qa.local", name: "QA Admin", passwordHash: await bcrypt.hash("admin123", 10), role: "admin" },
  });
  await prisma.user.create({
    data: { id: id("usr"), email: "qa@qa.local", name: "QA Engineer", passwordHash: await bcrypt.hash("qa123", 10), role: "qa" },
  });
  await prisma.user.create({
    data: { id: id("usr"), email: "viewer@qa.local", name: "QA Manager", passwordHash: await bcrypt.hash("viewer123", 10), role: "viewer" },
  });

  const project = await prisma.project.create({
    data: {
      id: id("prj"),
      orgId: org.id,
      name: "Pluma E2E",
      slug: "pluma-e2e",
      description: "test_entretien: Playwright + TypeScript TestPoint suite for app.pluma.ai.",
      qualityConfig: { create: { id: id("qc") } },
    },
  });
  await prisma.membership.create({
    data: { id: id("mem"), userId: admin.id, orgId: org.id, projectId: project.id, role: "admin" },
  });

  const dir = defaultReportsDir();
  console.log(`Importing test_entretien runs from ${dir}`);
  const result = await importReportsDir(project.id, dir);

  console.log(`Seed complete: ${result.imported.length} run(s) imported, ${result.skipped.length} skipped.`);
  console.log("Login: admin@qa.local / admin123");
  console.log("Project: Pluma E2E");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
