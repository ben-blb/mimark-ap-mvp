-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "conversationId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("conversationId","seq")
);

-- CreateIndex
CREATE INDEX "conversations_actor_updatedAt_idx" ON "conversations"("actor", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
