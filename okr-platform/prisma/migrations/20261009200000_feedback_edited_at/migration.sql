-- Feedback: "editado" pasa a ser un dato propio. @updatedAt se bumpeaba al marcar como leído,
-- así que se reemplaza por editedAt (solo lo fija una edición del autor).
ALTER TABLE "Feedback" ADD COLUMN "editedAt" TIMESTAMP(3);

-- Preserva datos: era "editado" si hubo un update posterior a la creación que no fue marcar leído.
UPDATE "Feedback"
SET "editedAt" = "updatedAt"
WHERE "updatedAt" > "createdAt"
  AND ("readAt" IS NULL OR "updatedAt" <> "readAt");

ALTER TABLE "Feedback" DROP COLUMN "updatedAt";
