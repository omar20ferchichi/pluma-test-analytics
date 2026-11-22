import { prisma } from "./prisma.js";
import { id } from "./ids.js";

export async function audit(action: string, entity: string, entityId?: string, userId?: string, meta?: unknown) {
  await prisma.auditLog.create({
    data: {
      id: id("aud"),
      action,
      entity,
      entityId,
      userId,
      metaJson: JSON.stringify(meta ?? {}),
    },
  });
}
