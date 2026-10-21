import { Workspace } from "@/components/workspace";
import { CHAT_MODEL, DOCUMENT_NAME, EMBEDDING_MODEL, TOP_K } from "@/lib/rag/config";

// Server shell: reads the pipeline constants on the server so the client island never imports server modules.
export default function Home() {
  return (
    <Workspace
      pipeline={{ topK: TOP_K, embeddingModel: EMBEDDING_MODEL, chatModel: CHAT_MODEL, documentName: DOCUMENT_NAME }}
    />
  );
}
