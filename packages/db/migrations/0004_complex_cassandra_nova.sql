-- Add responseLevel to UserSettings (exploratoire | statistique)
ALTER TABLE "ai_chatbot"."UserSettings" ADD COLUMN "responseLevel" varchar(32) DEFAULT 'exploratoire';