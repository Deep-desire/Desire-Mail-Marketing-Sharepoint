-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "ai_prompt" TEXT,
ADD COLUMN     "is_ai_generated" BOOLEAN NOT NULL DEFAULT false;
